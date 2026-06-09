using FieldTaskManager.Api.Common;
using FieldTaskManager.Api.Contracts.Auth;
using FieldTaskManager.Api.Data;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace FieldTaskManager.Api.Services;

/// <summary>
/// Self-registration (always Worker), credential verification, and JWT issuance
/// (architecture §3.3, §9.1). Passwords are BCrypt-hashed and never returned.
/// </summary>
public class AuthService : IAuthService
{
    private readonly AppDbContext _db;
    private readonly ITokenService _tokenService;

    public AuthService(AppDbContext db, ITokenService tokenService)
    {
        _db = db;
        _tokenService = tokenService;
    }

    public async Task<UserDto> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        var username = request.Username?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(username))
        {
            throw new ValidationException("Username is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
        {
            throw new ValidationException("Password is required and must be at least 6 characters.");
        }

        var exists = await _db.Users.AnyAsync(u => u.Username == username, ct);
        if (exists)
        {
            throw new ConflictException($"The username '{username}' is already taken.");
        }

        var displayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? username
            : request.DisplayName.Trim();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            Role = Role.Worker, // over-posting defense: self-registration is always a Worker
            DisplayName = displayName,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        return Map(user);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var username = request.Username?.Trim() ?? string.Empty;

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username, ct);
        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            // Do not distinguish unknown user from wrong password; both are 401.
            throw new UnauthorizedException("Invalid username or password.");
        }

        var token = _tokenService.CreateToken(user);
        return new AuthResponse(token, Map(user));
    }

    public async Task<UserDto> MeAsync(CurrentUser current, CancellationToken ct = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == current.Id, ct);
        if (user is null)
        {
            throw new NotFoundException("The current user no longer exists.");
        }

        return Map(user);
    }

    private static UserDto Map(User user) =>
        new(user.Id, user.Username, user.DisplayName, user.Role);
}
