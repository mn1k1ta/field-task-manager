using FieldTaskManager.Api.Domain.Enums;

namespace FieldTaskManager.Api.Contracts.Auth;

public record UserDto(
    Guid Id,
    string Username,
    string DisplayName,
    Role Role
);
