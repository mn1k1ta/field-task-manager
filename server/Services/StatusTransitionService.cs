using FieldTaskManager.Api.Common;
using FieldTaskManager.Api.Domain.Enums;

namespace FieldTaskManager.Api.Services;

/// <summary>
/// The single authority for status-transition legality (architecture §8).
/// <see cref="ITaskService"/> consults this for every status change; nothing else decides legality.
/// </summary>
public class StatusTransitionService
{
    /// <summary>
    /// Whether the given role may move a task from <paramref name="from"/> to <paramref name="to"/>.
    /// A no-op (from == to) is never allowed. Worker may only perform the forward transitions
    /// Created->InProgress and InProgress->Done on their own task. Admin may additionally
    /// Verify (Done->Verified) and Reopen (Done->InProgress, Verified->InProgress).
    /// No non-workflow jumps are permitted for either role.
    /// </summary>
    public bool CanTransition(Role role, FieldTaskStatus from, FieldTaskStatus to)
    {
        if (from == to)
        {
            return false;
        }

        var workerForward =
            (from == FieldTaskStatus.Created && to == FieldTaskStatus.InProgress) ||
            (from == FieldTaskStatus.InProgress && to == FieldTaskStatus.Done);

        if (role == Role.Worker)
        {
            return workerForward;
        }

        // Admin: forward transitions plus Verify and Reopen.
        return workerForward ||
            (from == FieldTaskStatus.Done && to == FieldTaskStatus.Verified) ||
            (from == FieldTaskStatus.Done && to == FieldTaskStatus.InProgress) ||
            (from == FieldTaskStatus.Verified && to == FieldTaskStatus.InProgress);
    }

    /// <summary>
    /// Whether the target transition is one reserved for the Admin role (Verify or Reopen).
    /// Used by the task service to choose 403 (role-gated target) vs 400 (structurally impossible)
    /// when a Worker attempts a transition (architecture §8.2 footnote).
    /// </summary>
    public bool IsAdminOnlyTarget(FieldTaskStatus from, FieldTaskStatus to)
    {
        return (from == FieldTaskStatus.Done && to == FieldTaskStatus.Verified) ||
            (from == FieldTaskStatus.Done && to == FieldTaskStatus.InProgress) ||
            (from == FieldTaskStatus.Verified && to == FieldTaskStatus.InProgress);
    }

    /// <summary>
    /// Validates a requested transition, throwing on illegality (architecture §8.1/§8.2).
    /// Throws <see cref="ForbiddenException"/> (403) when a Worker attempts an Admin-only
    /// transition (Verify or Reopen) — "you lack the role". Throws <see cref="ValidationException"/>
    /// (400) for a structurally impossible transition or a no-op (from == to), for either role.
    /// Ownership (Worker must own the task) is enforced by the caller before this runs.
    /// </summary>
    public void Validate(Role role, FieldTaskStatus from, FieldTaskStatus to)
    {
        if (CanTransition(role, from, to))
        {
            return;
        }

        // A Worker reaching for a Verify/Reopen target is denied on role grounds (403);
        // every other illegal case (including no-op and non-workflow jumps) is a 400.
        if (role == Role.Worker && from != to && IsAdminOnlyTarget(from, to))
        {
            throw new ForbiddenException(
                $"Workers may not perform this status change ({from} -> {to}). This action requires the Admin role.");
        }

        if (from == to)
        {
            throw new ValidationException($"The task is already in status {from}; no transition to perform.");
        }

        throw new ValidationException($"Illegal status transition: {from} -> {to}.");
    }
}
