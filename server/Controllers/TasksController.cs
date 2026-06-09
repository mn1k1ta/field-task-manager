using FieldTaskManager.Api.Contracts.Tasks;
using FieldTaskManager.Api.Security;
using FieldTaskManager.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FieldTaskManager.Api.Controllers;

[ApiController]
[Route("api/tasks")]
[Authorize]
public class TasksController : ControllerBase
{
    private readonly ITaskService _taskService;
    private readonly ICurrentUserAccessor _currentUser;

    public TasksController(ITaskService taskService, ICurrentUserAccessor currentUser)
    {
        _taskService = taskService;
        _currentUser = currentUser;
    }

    /// <summary>List tasks, role-scoped and filtered by query, ordered by deadline ascending.</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<TaskDto>>> List([FromQuery] TaskQuery query, CancellationToken ct)
    {
        var tasks = await _taskService.ListAsync(query, _currentUser.Current, ct);
        return Ok(tasks);
    }

    /// <summary>Get a single task. Worker requesting a task they are not assigned -> 404.</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TaskDto>> Get(Guid id, CancellationToken ct)
    {
        var task = await _taskService.GetAsync(id, _currentUser.Current, ct);
        return Ok(task);
    }

    /// <summary>Create a task (Admin only).</summary>
    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<TaskDto>> Create(CreateTaskRequest request, CancellationToken ct)
    {
        var task = await _taskService.CreateAsync(request, _currentUser.Current, ct);
        return CreatedAtAction(nameof(Get), new { id = task.Id }, task);
    }

    /// <summary>Edit task fields (Admin only). Does not change status or location.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<TaskDto>> Update(Guid id, UpdateTaskRequest request, CancellationToken ct)
    {
        var task = await _taskService.UpdateAsync(id, request, _currentUser.Current, ct);
        return Ok(task);
    }

    /// <summary>Delete a task (Admin only). Cascades comments.</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await _taskService.DeleteAsync(id, _currentUser.Current, ct);
        return NoContent();
    }

    /// <summary>Transition status (validated per the transition matrix + ownership).</summary>
    [HttpPatch("{id:guid}/status")]
    public async Task<ActionResult<TaskDto>> UpdateStatus(Guid id, UpdateStatusRequest request, CancellationToken ct)
    {
        var task = await _taskService.UpdateStatusAsync(id, request, _currentUser.Current, ct);
        return Ok(task);
    }

    /// <summary>Update coordinates (Admin only).</summary>
    [HttpPatch("{id:guid}/location")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<TaskDto>> UpdateLocation(Guid id, UpdateLocationRequest request, CancellationToken ct)
    {
        var task = await _taskService.UpdateLocationAsync(id, request, _currentUser.Current, ct);
        return Ok(task);
    }

    /// <summary>Reassign the task (Admin only).</summary>
    [HttpPatch("{id:guid}/assignee")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<TaskDto>> UpdateAssignee(Guid id, UpdateAssigneeRequest request, CancellationToken ct)
    {
        var task = await _taskService.UpdateAssigneeAsync(id, request, _currentUser.Current, ct);
        return Ok(task);
    }
}
