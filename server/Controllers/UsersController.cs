using FieldTaskManager.Api.Contracts.Auth;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Security;
using FieldTaskManager.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FieldTaskManager.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Roles = "Admin")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly ICurrentUserAccessor _currentUser;

    public UsersController(IUserService userService, ICurrentUserAccessor currentUser)
    {
        _userService = userService;
        _currentUser = currentUser;
    }

    /// <summary>List users (Admin only), optionally filtered by role (UI passes Worker for the assignee dropdown).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<UserDto>>> List([FromQuery] Role? role, CancellationToken ct)
    {
        var users = await _userService.ListAsync(role, _currentUser.Current, ct);
        return Ok(users);
    }
}
