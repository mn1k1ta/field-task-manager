namespace FieldTaskManager.Api.Domain.Entities;

public class Comment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid FieldTaskId { get; set; }

    public FieldTask FieldTask { get; set; } = null!;

    public Guid AuthorId { get; set; }

    public User Author { get; set; } = null!;

    public string Body { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; }
}
