using FieldTaskManager.Api.Domain.Enums;

namespace FieldTaskManager.Api.Contracts.Tasks;

public record TaskDto(
    Guid Id,
    string Title,
    string? Description,
    string Icon,
    Priority Priority,
    string[] Labels,
    double Latitude,
    double Longitude,
    double[][]? Area,
    Guid AssigneeId,
    string AssigneeName,
    DateTime Deadline,
    FieldTaskStatus Status,
    int AttachmentCount,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc
);
