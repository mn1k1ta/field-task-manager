using System.ComponentModel.DataAnnotations;

namespace FieldTaskManager.Api.Contracts.Tasks;

public record CreateTaskRequest(
    [Required]
    [StringLength(200, MinimumLength = 1)]
    string Title,

    [StringLength(8000)]
    string? Description,

    string? Icon,

    [Range(0, 3)]
    int? Priority,

    string[]? Labels,

    [Range(-90.0, 90.0)]
    double Latitude,

    [Range(-180.0, 180.0)]
    double Longitude,

    double[][]? Area,

    [Required]
    Guid AssigneeId,

    [Required]
    DateTime Deadline
);
