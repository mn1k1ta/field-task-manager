using FieldTaskManager.Api.Common;
using FieldTaskManager.Api.Contracts.Comments;
using FieldTaskManager.Api.Data;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace FieldTaskManager.Api.Services;

/// <summary>
/// Task comment thread (architecture §9.3). Ownership-scoped like tasks: a Worker may only
/// read/add comments on their own task (else 404, existence not leaked). Comments are
/// attributed to the current user and ordered oldest-to-newest (FR-16).
/// </summary>
public class CommentService : ICommentService
{
    private readonly AppDbContext _db;

    public CommentService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<CommentDto>> ListAsync(Guid taskId, CurrentUser current, CancellationToken ct = default)
    {
        await EnsureTaskVisibleAsync(taskId, current, ct);

        var comments = await _db.Comments
            .Include(c => c.Author)
            .Where(c => c.FieldTaskId == taskId)
            .OrderBy(c => c.CreatedAtUtc)
            .ToListAsync(ct);

        return comments.Select(Map).ToList();
    }

    public async Task<CommentDto> AddAsync(Guid taskId, CreateCommentRequest request, CurrentUser current, CancellationToken ct = default)
    {
        await EnsureTaskVisibleAsync(taskId, current, ct);

        var body = (request.Body ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(body))
        {
            throw new ValidationException("Comment body is required.");
        }

        var comment = new Comment
        {
            Id = Guid.NewGuid(),
            FieldTaskId = taskId,
            AuthorId = current.Id,
            Body = body,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.Comments.Add(comment);
        await _db.SaveChangesAsync(ct);

        // Reload the author navigation for the DTO's authorName.
        await _db.Entry(comment).Reference(c => c.Author).LoadAsync(ct);
        return Map(comment);
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

    private static CommentDto Map(Comment comment) =>
        new(
            comment.Id,
            comment.FieldTaskId,
            comment.AuthorId,
            comment.Author?.DisplayName ?? string.Empty,
            comment.Body,
            comment.CreatedAtUtc);
}
