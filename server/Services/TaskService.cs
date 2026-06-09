using System.Text.Json;
using FieldTaskManager.Api.Common;
using FieldTaskManager.Api.Contracts.Tasks;
using FieldTaskManager.Api.Data;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace FieldTaskManager.Api.Services;

/// <summary>
/// Task CRUD, role-scoped reads, status transitions, location/assignee updates
/// (architecture §7.3, §8, §9.2). Ownership and role are enforced here, never in the UI.
/// </summary>
public class TaskService : ITaskService
{
    private readonly AppDbContext _db;
    private readonly StatusTransitionService _transitions;

    public TaskService(AppDbContext db, StatusTransitionService transitions)
    {
        _db = db;
        _transitions = transitions;
    }

    public async Task<IReadOnlyList<TaskDto>> ListAsync(TaskQuery query, CurrentUser current, CancellationToken ct = default)
    {
        IQueryable<FieldTask> q = _db.FieldTasks.Include(t => t.Assignee);

        // Role scoping (§7.3): Workers are hard-scoped to their own tasks; a Worker-supplied
        // assigneeId is ignored. Admins may optionally narrow by assigneeId.
        if (current.Role == Role.Worker)
        {
            q = q.Where(t => t.AssigneeId == current.Id);
        }
        else if (query.AssigneeId is Guid assigneeId)
        {
            q = q.Where(t => t.AssigneeId == assigneeId);
        }

        if (query.Status is FieldTaskStatus status)
        {
            q = q.Where(t => t.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLower();
            q = q.Where(t =>
                t.Title.ToLower().Contains(term) ||
                (t.Description != null && t.Description.ToLower().Contains(term)));
        }

        // Project the attachment count alongside each task so the list does not lazy-load
        // (or eagerly materialize) every attachment row just to count them.
        var rows = await q
            .OrderBy(t => t.Deadline)
            .Select(t => new { Task = t, AttachmentCount = t.Attachments.Count })
            .ToListAsync(ct);

        return rows.Select(r => Map(r.Task, r.AttachmentCount)).ToList();
    }

    public async Task<TaskDto> GetAsync(Guid id, CurrentUser current, CancellationToken ct = default)
    {
        var task = await LoadVisibleAsync(id, current, ct);
        return Map(task, task.Attachments.Count);
    }

    public async Task<TaskDto> CreateAsync(CreateTaskRequest request, CurrentUser current, CancellationToken ct = default)
    {
        var title = (request.Title ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(title))
        {
            throw new ValidationException("Title is required.");
        }

        ValidateCoordinates(request.Latitude, request.Longitude);

        await EnsureAssigneeIsWorkerAsync(request.AssigneeId, ct);

        if (request.Deadline == default)
        {
            throw new ValidationException("Deadline is required.");
        }

        var now = DateTime.UtcNow;
        var task = new FieldTask
        {
            Id = Guid.NewGuid(),
            Title = title,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Icon = NormalizeIcon(request.Icon),
            Priority = NormalizePriority(request.Priority),
            Labels = NormalizeLabels(request.Labels),
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            Area = NormalizeArea(request.Area),
            AssigneeId = request.AssigneeId,
            Deadline = request.Deadline,
            Status = FieldTaskStatus.Created,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        _db.FieldTasks.Add(task);
        await _db.SaveChangesAsync(ct);

        // Reload the assignee navigation for the DTO's assigneeName. A freshly created task has no attachments.
        await _db.Entry(task).Reference(t => t.Assignee).LoadAsync(ct);
        return Map(task, attachmentCount: 0);
    }

    public async Task<TaskDto> UpdateAsync(Guid id, UpdateTaskRequest request, CurrentUser current, CancellationToken ct = default)
    {
        var task = await _db.FieldTasks
            .Include(t => t.Assignee)
            .FirstOrDefaultAsync(t => t.Id == id, ct)
            ?? throw new NotFoundException();

        var title = (request.Title ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(title))
        {
            throw new ValidationException("Title is required.");
        }

        await EnsureAssigneeIsWorkerAsync(request.AssigneeId, ct);

        if (request.Deadline == default)
        {
            throw new ValidationException("Deadline is required.");
        }

        task.Title = title;
        task.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        task.Icon = NormalizeIcon(request.Icon);
        task.Priority = NormalizePriority(request.Priority);
        task.Labels = NormalizeLabels(request.Labels);
        task.Area = NormalizeArea(request.Area);
        task.AssigneeId = request.AssigneeId;
        task.Deadline = request.Deadline;
        task.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        // Assignee may have changed; reload the navigation for an accurate assigneeName.
        await _db.Entry(task).Reference(t => t.Assignee).LoadAsync(ct);
        var attachmentCount = await _db.Attachments.CountAsync(a => a.FieldTaskId == task.Id, ct);
        return Map(task, attachmentCount);
    }

    public async Task DeleteAsync(Guid id, CurrentUser current, CancellationToken ct = default)
    {
        var task = await _db.FieldTasks.FirstOrDefaultAsync(t => t.Id == id, ct)
            ?? throw new NotFoundException();

        _db.FieldTasks.Remove(task);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<TaskDto> UpdateStatusAsync(Guid id, UpdateStatusRequest request, CurrentUser current, CancellationToken ct = default)
    {
        // Ownership-checked load (Worker non-owner -> 404, existence not leaked).
        var task = await LoadVisibleAsync(id, current, ct);

        var from = task.Status;
        var to = request.Status;
        var attachmentCount = task.Attachments.Count;

        // The single authority for transition legality (§8). Throws 403/400 as appropriate.
        _transitions.Validate(current.Role, from, to);

        var now = DateTime.UtcNow;
        task.Status = to;
        task.UpdatedAtUtc = now;

        // Audit trail (§8.3): append an attributed, timestamped status comment.
        var audit = new Comment
        {
            Id = Guid.NewGuid(),
            FieldTaskId = task.Id,
            AuthorId = current.Id,
            Body = $"[status] {current.Name} changed status: {from} -> {to}",
            CreatedAtUtc = now
        };
        _db.Comments.Add(audit);

        await _db.SaveChangesAsync(ct);
        return Map(task, attachmentCount);
    }

    public async Task<TaskDto> UpdateLocationAsync(Guid id, UpdateLocationRequest request, CurrentUser current, CancellationToken ct = default)
    {
        var task = await _db.FieldTasks
            .Include(t => t.Assignee)
            .FirstOrDefaultAsync(t => t.Id == id, ct)
            ?? throw new NotFoundException();

        ValidateCoordinates(request.Latitude, request.Longitude);

        task.Latitude = request.Latitude;
        task.Longitude = request.Longitude;
        task.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        var attachmentCount = await _db.Attachments.CountAsync(a => a.FieldTaskId == task.Id, ct);
        return Map(task, attachmentCount);
    }

    public async Task<TaskDto> UpdateAssigneeAsync(Guid id, UpdateAssigneeRequest request, CurrentUser current, CancellationToken ct = default)
    {
        var task = await _db.FieldTasks
            .Include(t => t.Assignee)
            .FirstOrDefaultAsync(t => t.Id == id, ct)
            ?? throw new NotFoundException();

        await EnsureAssigneeIsWorkerAsync(request.AssigneeId, ct);

        task.AssigneeId = request.AssigneeId;
        task.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        await _db.Entry(task).Reference(t => t.Assignee).LoadAsync(ct);
        var attachmentCount = await _db.Attachments.CountAsync(a => a.FieldTaskId == task.Id, ct);
        return Map(task, attachmentCount);
    }

    /// <summary>
    /// Loads a task with its assignee, enforcing Worker ownership: a missing task, or a task a
    /// Worker is not assigned to, both surface as <see cref="NotFoundException"/> (§7.3 — 404, no leak).
    /// </summary>
    private async Task<FieldTask> LoadVisibleAsync(Guid id, CurrentUser current, CancellationToken ct)
    {
        var task = await _db.FieldTasks
            .Include(t => t.Assignee)
            .Include(t => t.Attachments)
            .FirstOrDefaultAsync(t => t.Id == id, ct);

        if (task is null)
        {
            throw new NotFoundException();
        }

        if (current.Role == Role.Worker && task.AssigneeId != current.Id)
        {
            throw new NotFoundException();
        }

        return task;
    }

    private async Task EnsureAssigneeIsWorkerAsync(Guid assigneeId, CancellationToken ct)
    {
        var assignee = await _db.Users.FirstOrDefaultAsync(u => u.Id == assigneeId, ct);
        if (assignee is null || assignee.Role != Role.Worker)
        {
            throw new ValidationException("The assignee must be an existing Worker.");
        }
    }

    private static void ValidateCoordinates(double latitude, double longitude)
    {
        if (latitude is < -90.0 or > 90.0)
        {
            throw new ValidationException("Latitude must be between -90 and 90.");
        }

        if (longitude is < -180.0 or > 180.0)
        {
            throw new ValidationException("Longitude must be between -180 and 180.");
        }
    }

    /// <summary>
    /// Maps an entity to its DTO. <paramref name="attachmentCount"/> is supplied by the caller so
    /// the count can come from a projection or a loaded navigation without forcing a lazy load.
    /// </summary>
    private static TaskDto Map(FieldTask task, int attachmentCount) =>
        new(
            task.Id,
            task.Title,
            task.Description,
            string.IsNullOrEmpty(task.Icon) ? DefaultIcon : task.Icon,
            task.Priority,
            task.Labels.ToArray(),
            task.Latitude,
            task.Longitude,
            DeserializeArea(task.Area),
            task.AssigneeId,
            task.Assignee?.DisplayName ?? string.Empty,
            task.Deadline,
            task.Status,
            attachmentCount,
            task.CreatedAtUtc,
            task.UpdatedAtUtc);

    private const string DefaultIcon = "📍";

    /// <summary>Resolves the request icon to a stored value: trimmed, or the default when null/empty.</summary>
    private static string NormalizeIcon(string? icon)
    {
        var trimmed = (icon ?? string.Empty).Trim();
        return string.IsNullOrEmpty(trimmed) ? DefaultIcon : trimmed;
    }

    /// <summary>Maps the optional request priority int (0..3) to the enum, defaulting to Medium.</summary>
    private static Priority NormalizePriority(int? priority)
    {
        if (priority is int value && Enum.IsDefined(typeof(Priority), value))
        {
            return (Priority)value;
        }

        return Priority.Medium;
    }

    /// <summary>Trims labels, drops empties, caps length to 30 chars and the list to 10 entries.</summary>
    private static List<string> NormalizeLabels(string[]? labels)
    {
        if (labels is null || labels.Length == 0)
        {
            return new List<string>();
        }

        return labels
            .Select(l => (l ?? string.Empty).Trim())
            .Where(l => l.Length > 0)
            .Select(l => l.Length > 30 ? l[..30] : l)
            .Take(10)
            .ToList();
    }

    /// <summary>
    /// Validates an optional polygon area and resolves it to the stored JSON string.
    /// A null/empty area or one with fewer than 3 coordinate pairs is treated as "no area"
    /// (returns null). When present, every pair must be a [lat, lng] with lat in -90..90 and
    /// lng in -180..180; otherwise a <see cref="ValidationException"/> (400) is thrown.
    /// </summary>
    private static string? NormalizeArea(double[][]? area)
    {
        const int maxVertices = 500;
        if (area is null || area.Length < 3)
        {
            return null;
        }

        if (area.Length > maxVertices)
        {
            throw new ValidationException($"An area can have at most {maxVertices} vertices.");
        }

        foreach (var pair in area)
        {
            if (pair is null || pair.Length != 2)
            {
                throw new ValidationException("Each area coordinate must be a [latitude, longitude] pair.");
            }

            ValidateCoordinates(pair[0], pair[1]);
        }

        return JsonSerializer.Serialize(area, (JsonSerializerOptions?)null);
    }

    /// <summary>Deserializes the stored Area JSON back to a polygon, or null when absent/blank.</summary>
    private static double[][]? DeserializeArea(string? area)
    {
        if (string.IsNullOrEmpty(area))
        {
            return null;
        }

        // Defensive: a manually edited / legacy row that isn't valid double[][] must
        // not turn an otherwise-valid task read into a 500. Treat it as "no area".
        try
        {
            return JsonSerializer.Deserialize<double[][]>(area, (JsonSerializerOptions?)null);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
