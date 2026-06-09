using System.Text;
using FieldTaskManager.Api.Common;
using FieldTaskManager.Api.Contracts.Auth;
using FieldTaskManager.Api.Data;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Security;
using FieldTaskManager.Api.Services;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace FieldTaskManager.Tests.Unit;

/// <summary>
/// AuthService against a real in-memory DbContext, a real TokenService (real JWT signing) and real
/// BCrypt: register always Worker (ignores any escalation), duplicate username -> Conflict, wrong
/// password -> the 401 path (UnauthorizedException), success -> AuthResponse with a token.
/// TokenService: the produced JWT decodes to the expected sub/role/name claims.
/// </summary>
public class AuthServiceTests : IDisposable
{
    private const string SigningKey = "0123456789abcdef0123456789abcdef0123456789abcdef"; // >= 32 bytes
    private const string Issuer = "FieldTaskManager";
    private const string Audience = "FieldTaskManager";

    private readonly TestDb _db = new();
    private readonly TokenService _tokenService;

    public AuthServiceTests()
    {
        var settings = new JwtSettings
        {
            Issuer = Issuer,
            Audience = Audience,
            SigningKey = SigningKey,
            AccessTokenMinutes = 480
        };
        _tokenService = new TokenService(Options.Create(settings));
    }

    private AuthService NewService(AppDbContext ctx) => new(ctx, _tokenService);

    // ---------- Register ----------

    [Fact]
    public async Task Register_AlwaysCreatesWorker()
    {
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).RegisterAsync(new RegisterRequest("alice", "Passw0rd!", "Alice"));
        Assert.Equal(Role.Worker, dto.Role);
        Assert.Equal("alice", dto.Username);
        Assert.Equal("Alice", dto.DisplayName);
    }

    [Fact]
    public async Task Register_StoresBcryptHash_NotPlaintext()
    {
        using (var ctx = _db.NewContext())
        {
            await NewService(ctx).RegisterAsync(new RegisterRequest("bob", "Passw0rd!", null));
        }

        using var verify = _db.NewContext();
        var user = verify.Users.Single(u => u.Username == "bob");
        Assert.NotEqual("Passw0rd!", user.PasswordHash);
        Assert.True(BCrypt.Net.BCrypt.Verify("Passw0rd!", user.PasswordHash));
        Assert.Equal("bob", user.DisplayName); // defaults to username when not supplied
    }

    [Fact]
    public async Task Register_DuplicateUsername_ThrowsConflict()
    {
        using var ctx = _db.NewContext();
        var svc = NewService(ctx);
        await svc.RegisterAsync(new RegisterRequest("carol", "Passw0rd!", null));
        await Assert.ThrowsAsync<ConflictException>(() =>
            svc.RegisterAsync(new RegisterRequest("carol", "Different1!", null)));
    }

    [Fact]
    public async Task Register_BlankUsername_ThrowsValidation()
    {
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<ValidationException>(() =>
            NewService(ctx).RegisterAsync(new RegisterRequest("   ", "Passw0rd!", null)));
    }

    [Fact]
    public async Task Register_ShortPassword_ThrowsValidation()
    {
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<ValidationException>(() =>
            NewService(ctx).RegisterAsync(new RegisterRequest("dave", "12345", null)));
    }

    // ---------- Login ----------

    [Fact]
    public async Task Login_WrongPassword_ThrowsUnauthorized()
    {
        using var ctx = _db.NewContext();
        var svc = NewService(ctx);
        await svc.RegisterAsync(new RegisterRequest("erin", "CorrectHorse1!", null));
        await Assert.ThrowsAsync<UnauthorizedException>(() =>
            svc.LoginAsync(new LoginRequest("erin", "wrong-password")));
    }

    [Fact]
    public async Task Login_UnknownUser_ThrowsUnauthorized()
    {
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<UnauthorizedException>(() =>
            NewService(ctx).LoginAsync(new LoginRequest("nobody", "whatever1!")));
    }

    [Fact]
    public async Task Login_Success_ReturnsTokenAndUser()
    {
        using var ctx = _db.NewContext();
        var svc = NewService(ctx);
        await svc.RegisterAsync(new RegisterRequest("frank", "GoodPass1!", "Frank"));

        var response = await svc.LoginAsync(new LoginRequest("frank", "GoodPass1!"));

        Assert.False(string.IsNullOrWhiteSpace(response.Token));
        Assert.Equal("frank", response.User.Username);
        Assert.Equal(Role.Worker, response.User.Role);
    }

    // ---------- Me ----------

    [Fact]
    public async Task Me_ReturnsCurrentUserProfile()
    {
        var user = _db.SeedUser(Role.Worker, "grace", "Grace");
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).MeAsync(CurrentUsers.For(user));
        Assert.Equal("grace", dto.Username);
        Assert.Equal(Role.Worker, dto.Role);
    }

    [Fact]
    public async Task Me_MissingUser_ThrowsNotFound()
    {
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewService(ctx).MeAsync(CurrentUsers.Worker(Guid.NewGuid())));
    }

    // ---------- TokenService: JWT claims ----------

    [Fact]
    public async Task TokenService_ProducesJwt_WithSubRoleNameClaims()
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = "hank",
            DisplayName = "Hank The Admin",
            Role = Role.Admin,
            PasswordHash = "x",
            CreatedAtUtc = DateTime.UtcNow
        };

        var token = _tokenService.CreateToken(user);

        var handler = new JsonWebTokenHandler();
        var result = await handler.ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = Issuer,
            ValidateAudience = true,
            ValidAudience = Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey))
        });

        Assert.True(result.IsValid);

        var jwt = (JsonWebToken)result.SecurityToken;
        Assert.Equal(user.Id.ToString(), jwt.GetClaim("sub").Value);
        Assert.Equal("Admin", jwt.GetClaim("role").Value);
        Assert.Equal("Hank The Admin", jwt.GetClaim("name").Value);
    }

    [Fact]
    public async Task TokenService_WorkerRole_SerializesAsWorkerName()
    {
        var user = _db.SeedUser(Role.Worker, "ivy", "Ivy");
        var token = _tokenService.CreateToken(user);

        var handler = new JsonWebTokenHandler();
        var result = await handler.ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = Issuer,
            ValidateAudience = true,
            ValidAudience = Audience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey))
        });

        var jwt = (JsonWebToken)result.SecurityToken;
        Assert.Equal("Worker", jwt.GetClaim("role").Value);
    }

    public void Dispose() => _db.Dispose();
}
