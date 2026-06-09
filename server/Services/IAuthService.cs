using FieldTaskManager.Api.Contracts.Auth;
using FieldTaskManager.Api.Security;

namespace FieldTaskManager.Api.Services;

public interface IAuthService
{
    /// <summary>Self-register a new Worker. Role is always forced to Worker. Throws ConflictException on duplicate username.</summary>
    Task<UserDto> RegisterAsync(RegisterRequest request, CancellationToken ct = default);

    /// <summary>Verify credentials and issue a JWT. Throws ForbiddenException-style 401 path via invalid-credentials handling.</summary>
    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct = default);

    /// <summary>Return the current user's profile from the validated token claims.</summary>
    Task<UserDto> MeAsync(CurrentUser current, CancellationToken ct = default);
}
