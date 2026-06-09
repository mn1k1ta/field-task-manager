using System.ComponentModel.DataAnnotations;

namespace FieldTaskManager.Api.Contracts.Tasks;

public record UpdateTaskRequest(
    [Required]
    [StringLength(200, MinimumLength = 1)]
    string Title,

    [StringLength(8000)]
    string? Description,

    string? Icon,

    [Range(0, 3)]
    int? Priority,

    string[]? Labels,

    double[][]? Area,

    [Required]
    Guid AssigneeId,

    [Required]
    DateTime Deadline
);
