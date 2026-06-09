using System.Security.Claims;
using FieldTaskManager.Api.Domain.Enums;
using Microsoft.IdentityModel.JsonWebTokens;

namespace FieldTaskManager.Api.Security;

public class CurrentUserAccessor : ICurrentUserAccessor
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserAccessor(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public CurrentUser? Get()
    {
        var principal = _httpContextAccessor.HttpContext?.User;
        if (principal?.Identity is not { IsAuthenticated: true })
        {
            return null;
        }

        var sub = principal.FindFirstValue("sub")
                  ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                  ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(sub, out var id))
        {
            return null;
        }

        var roleClaim = principal.FindFirstValue("role") ?? principal.FindFirstValue(ClaimTypes.Role);
        if (!Enum.TryParse<Role>(roleClaim, out var role))
        {
            return null;
        }

        var name = principal.FindFirstValue("name") ?? principal.FindFirstValue(ClaimTypes.Name) ?? string.Empty;

        return new CurrentUser(id, role, name);
    }

    public CurrentUser Current =>
        Get() ?? throw new InvalidOperationException("No authenticated user on the current request.");
}
