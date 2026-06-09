namespace FieldTaskManager.Api.Contracts.Auth;

public record AuthResponse(
    string Token,
    UserDto User
);
