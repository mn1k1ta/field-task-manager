using FieldTaskManager.Api.Contracts.Auth;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Security;

namespace FieldTaskManager.Api.Services;

public interface IUserService
{
    /// <summary>List users (Admin only), optionally filtered by role. The UI passes Worker to populate the assignee dropdown.</summary>
    Task<IReadOnlyList<UserDto>> ListAsync(Role? role, CurrentUser current, CancellationToken ct = default);
}
