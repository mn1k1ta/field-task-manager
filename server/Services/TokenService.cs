using System.Security.Claims;
using System.Text;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Security;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace FieldTaskManager.Api.Services;

/// <summary>
/// Builds signed JWTs (architecture §7.1) using <see cref="JsonWebTokenHandler"/> and a
/// <see cref="SecurityTokenDescriptor"/>. Claims: sub = user id, role = role name
/// ("Admin"/"Worker"), name = display name. Issuer/audience/lifetime come from
/// <see cref="JwtSettings"/>; signed with HMAC-SHA256 over the configured signing key.
/// </summary>
public class TokenService : ITokenService
{
    private readonly JwtSettings _settings;

    public TokenService(IOptions<JwtSettings> settings)
    {
        _settings = settings.Value;
    }

    public string CreateToken(User user)
    {
        var now = DateTime.UtcNow;

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_settings.SigningKey));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _settings.Issuer,
            Audience = _settings.Audience,
            IssuedAt = now,
            NotBefore = now,
            Expires = now.AddMinutes(_settings.AccessTokenMinutes),
            SigningCredentials = credentials,
            // Short, standard JWT claim names so the SPA (which reads sub/role/name)
            // and the server agree on the wire format. See Program.cs (MapInboundClaims=false,
            // RoleClaimType="role", NameClaimType="name") and CurrentUserAccessor.
            Claims = new Dictionary<string, object>
            {
                ["sub"] = user.Id.ToString(),
                ["role"] = user.Role.ToString(),
                ["name"] = user.DisplayName
            }
        };

        var handler = new JsonWebTokenHandler();
        return handler.CreateToken(descriptor);
    }
}
