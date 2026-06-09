using FieldTaskManager.Api.Domain.Enums;

namespace FieldTaskManager.Api.Contracts.Tasks;

public record UpdateStatusRequest(
    FieldTaskStatus Status
);
