using FieldTaskManager.Api.Contracts.Tasks;
using FieldTaskManager.Api.Security;

namespace FieldTaskManager.Api.Services;

public interface ITaskService
{
    /// <summary>List tasks, role-scoped (Worker = own only), filtered by query, ordered by deadline ascending.</summary>
    Task<IReadOnlyList<TaskDto>> ListAsync(TaskQuery query, CurrentUser current, CancellationToken ct = default);

    /// <summary>Get a single task. Worker requesting a task they are not assigned -> NotFoundException (existence not leaked).</summary>
    Task<TaskDto> GetAsync(Guid id, CurrentUser current, CancellationToken ct = default);

    /// <summary>Create a task (Admin only). Assignee must exist and be a Worker. Status defaults to Created.</summary>
    Task<TaskDto> CreateAsync(CreateTaskRequest request, CurrentUser current, CancellationToken ct = default);

    /// <summary>Edit task fields (Admin only). Does not change status or location.</summary>
    Task<TaskDto> UpdateAsync(Guid id, UpdateTaskRequest request, CurrentUser current, CancellationToken ct = default);

    /// <summary>Delete a task (Admin only). Cascades comments.</summary>
    Task DeleteAsync(Guid id, CurrentUser current, CancellationToken ct = default);

    /// <summary>Transition status (validated via StatusTransitionService + ownership). Appends an audit comment on success.</summary>
    Task<TaskDto> UpdateStatusAsync(Guid id, UpdateStatusRequest request, CurrentUser current, CancellationToken ct = default);

    /// <summary>Update coordinates (Admin only).</summary>
    Task<TaskDto> UpdateLocationAsync(Guid id, UpdateLocationRequest request, CurrentUser current, CancellationToken ct = default);

    /// <summary>Reassign the task (Admin only). New assignee must exist and be a Worker.</summary>
    Task<TaskDto> UpdateAssigneeAsync(Guid id, UpdateAssigneeRequest request, CurrentUser current, CancellationToken ct = default);
}
