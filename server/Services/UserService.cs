using FieldTaskManager.Api.Contracts.Auth;
using FieldTaskManager.Api.Data;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace FieldTaskManager.Api.Services;

/// <summary>
/// User lookups for the Admin-only assignee dropdown (architecture §9.4). The Admin-only gate
/// is enforced declaratively on the controller; this service applies the optional role filter.
/// </summary>
public class UserService : IUserService
{
    private readonly AppDbContext _db;

    public UserService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<UserDto>> ListAsync(Role? role, CurrentUser current, CancellationToken ct = default)
    {
        IQueryable<User> q = _db.Users.AsNoTracking();

        if (role is Role r)
        {
            q = q.Where(u => u.Role == r);
        }

        var users = await q
            .OrderBy(u => u.DisplayName)
            .ToListAsync(ct);

        return users.Select(Map).ToList();
    }

    private static UserDto Map(User user) =>
        new(user.Id, user.Username, user.DisplayName, user.Role);
}
