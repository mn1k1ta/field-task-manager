using FieldTaskManager.Api.Domain.Enums;

namespace FieldTaskManager.Api.Domain.Entities;

public class FieldTask
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Title { get; set; } = string.Empty;

    /// <summary>Optional free text; holds Markdown (rendered + sanitized on the client).</summary>
    public string? Description { get; set; }

    /// <summary>The marker glyph the user picked (an emoji, e.g. "🔧"). Defaults to "📍".</summary>
    public string Icon { get; set; } = "📍";

    public Priority Priority { get; set; } = Priority.Medium;

    /// <summary>Free-form tags. Persisted as a JSON array in a single TEXT column.</summary>
    public List<string> Labels { get; set; } = new();

    public double Latitude { get; set; }

    public double Longitude { get; set; }

    /// <summary>
    /// Optional polygon area. Stored as a JSON array of [lat,lng] pairs
    /// (e.g. "[[50.1,30.2],[50.2,30.3],[50.15,30.35]]"); null when the task has no area.
    /// The point (Latitude/Longitude) stays the required map anchor.
    /// </summary>
    public string? Area { get; set; }

    public Guid AssigneeId { get; set; }

    public User Assignee { get; set; } = null!;

    public DateTime Deadline { get; set; }

    public FieldTaskStatus Status { get; set; } = FieldTaskStatus.Created;

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }

    public ICollection<Comment> Comments { get; set; } = new List<Comment>();

    public ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();
}
