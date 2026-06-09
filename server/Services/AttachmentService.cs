using FieldTaskManager.Api.Common;
using FieldTaskManager.Api.Contracts.Attachments;
using FieldTaskManager.Api.Data;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace FieldTaskManager.Api.Services;

/// <summary>
/// Task file attachments (Jira-style). Ownership-scoped like comments: a Worker may only
/// list/add/read/delete attachments on their own task (else 404, existence not leaked). Binaries
/// live on disk under App_Data/uploads/{taskId}; only metadata is stored in the database.
/// </summary>
public class AttachmentService : IAttachmentService
{
    private const long MaxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

    private readonly AppDbContext _db;
    private readonly IAttachmentStorage _storage;

    public AttachmentService(AppDbContext db, IAttachmentStorage storage)
    {
        _db = db;
        _storage = storage;
    }

    public async Task<IReadOnlyList<AttachmentDto>> ListAsync(Guid taskId, CurrentUser current, CancellationToken ct = default)
    {
        await EnsureTaskVisibleAsync(taskId, current, ct);

        var attachments = await _db.Attachments
            .Include(a => a.UploadedBy)
            .Where(a => a.FieldTaskId == taskId)
            .OrderBy(a => a.UploadedAtUtc)
            .ToListAsync(ct);

        return attachments.Select(Map).ToList();
    }

    public async Task<AttachmentDto> AddAsync(Guid taskId, IFormFile? file, CurrentUser current, CancellationToken ct = default)
    {
        await EnsureTaskVisibleAsync(taskId, current, ct);

        if (file is null || file.Length <= 0)
        {
            throw new ValidationException("A file is required.");
        }

        if (file.Length > MaxFileSizeBytes)
        {
            throw new ValidationException("The file exceeds the 10 MB limit.");
        }

        var fileName = SafeFileName(file.FileName);
        var contentType = string.IsNullOrWhiteSpace(file.ContentType)
            ? "application/octet-stream"
            : file.ContentType.Trim();

        await using var uploadStream = file.OpenReadStream();
        var storedName = await _storage.SaveAsync(taskId, fileName, uploadStream, ct);

        var attachment = new Attachment
        {
            Id = Guid.NewGuid(),
            FieldTaskId = taskId,
            FileName = fileName,
            ContentType = contentType,
            SizeBytes = file.Length,
            StoredName = storedName,
            UploadedById = current.Id,
            UploadedAtUtc = DateTime.UtcNow
        };

        _db.Attachments.Add(attachment);
        await _db.SaveChangesAsync(ct);

        // Reload the uploader navigation for the DTO's uploadedByName.
        await _db.Entry(attachment).Reference(a => a.UploadedBy).LoadAsync(ct);
        return Map(attachment);
    }

    public async Task<AttachmentContent> GetContentAsync(Guid taskId, Guid attachmentId, CurrentUser current, CancellationToken ct = default)
    {
        await EnsureTaskVisibleAsync(taskId, current, ct);

        var attachment = await _db.Attachments
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.FieldTaskId == taskId, ct)
            ?? throw new NotFoundException();

        var stream = _storage.OpenRead(taskId, attachment.StoredName)
            ?? throw new NotFoundException();

        return new AttachmentContent(stream, attachment.ContentType, attachment.FileName);
    }

    public async Task DeleteAsync(Guid taskId, Guid attachmentId, CurrentUser current, CancellationToken ct = default)
    {
        await EnsureTaskVisibleAsync(taskId, current, ct);

        var attachment = await _db.Attachments
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.FieldTaskId == taskId, ct)
            ?? throw new NotFoundException();

        // Only the uploader or an Admin may delete an attachment.
        if (current.Role != Role.Admin && attachment.UploadedById != current.Id)
        {
            throw new ForbiddenException("Only the uploader or an administrator may delete this attachment.");
        }

        _db.Attachments.Remove(attachment);
        await _db.SaveChangesAsync(ct);

        _storage.Delete(taskId, attachment.StoredName);
    }

    /// <summary>
    /// Verifies the task exists and is visible to the caller. A missing task, or a task a Worker
    /// is not assigned to, both surface as <see cref="NotFoundException"/> (§7.3 — 404, no leak).
    /// </summary>
    private async Task EnsureTaskVisibleAsync(Guid taskId, CurrentUser current, CancellationToken ct)
    {
        var task = await _db.FieldTasks
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == taskId, ct);

        if (task is null)
        {
            throw new NotFoundException();
        }

        if (current.Role == Role.Worker && task.AssigneeId != current.Id)
        {
            throw new NotFoundException();
        }
    }

    /// <summary>Strips any path components a client may have sent and caps the length to the column size.</summary>
    private static string SafeFileName(string? fileName)
    {
        var name = Path.GetFileName(fileName ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(name))
        {
            name = "file";
        }

        return name.Length > 260 ? name[^260..] : name;
    }

    private static AttachmentDto Map(Attachment attachment) =>
        new(
            attachment.Id,
            attachment.FieldTaskId,
            attachment.FileName,
            attachment.ContentType,
            attachment.SizeBytes,
            attachment.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase),
            attachment.UploadedById,
            attachment.UploadedBy?.DisplayName ?? string.Empty,
            attachment.UploadedAtUtc,
            $"/api/tasks/{attachment.FieldTaskId}/attachments/{attachment.Id}/content");
}
