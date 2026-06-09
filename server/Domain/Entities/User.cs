using FieldTaskManager.Api.Domain.Enums;

namespace FieldTaskManager.Api.Domain.Entities;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Username { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public Role Role { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; }

    public ICollection<FieldTask> AssignedTasks { get; set; } = new List<FieldTask>();

    public ICollection<Comment> Comments { get; set; } = new List<Comment>();
}
