using FieldTaskManager.Api.Domain.Enums;

namespace FieldTaskManager.Api.Contracts.Tasks;

public record TaskQuery(
    string? Search,
    FieldTaskStatus? Status,
    Guid? AssigneeId
);
