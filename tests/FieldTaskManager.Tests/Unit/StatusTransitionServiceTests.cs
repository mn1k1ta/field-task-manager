using FieldTaskManager.Api.Common;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Services;

namespace FieldTaskManager.Tests.Unit;

/// <summary>
/// Exercises the single transition authority (architecture §8) across the full (role, from, to) matrix:
/// Worker forward transitions, Admin Verify/Reopen, Worker-forbidden Admin-only targets (403),
/// structurally illegal jumps and no-ops (400), and both CanTransition + IsAdminOnlyTarget.
/// </summary>
public class StatusTransitionServiceTests
{
    private readonly StatusTransitionService _svc = new();

    // ---- CanTransition: Worker ----

    [Theory]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.InProgress)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Done)]
    public void Worker_ForwardTransitions_AreAllowed(FieldTaskStatus from, FieldTaskStatus to)
    {
        Assert.True(_svc.CanTransition(Role.Worker, from, to));
    }

    [Theory]
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.Verified)]    // Verify
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.InProgress)]  // Reopen
    [InlineData(FieldTaskStatus.Verified, FieldTaskStatus.InProgress)] // Reopen
    public void Worker_AdminOnlyTransitions_AreForbidden(FieldTaskStatus from, FieldTaskStatus to)
    {
        Assert.False(_svc.CanTransition(Role.Worker, from, to));
    }

    [Theory]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.Done)]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.Verified)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Verified)]
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.Created)]       // backward
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Created)] // backward
    public void Worker_IllegalTransitions_AreNotAllowed(FieldTaskStatus from, FieldTaskStatus to)
    {
        Assert.False(_svc.CanTransition(Role.Worker, from, to));
    }

    // ---- CanTransition: Admin ----

    [Theory]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.InProgress)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Done)]
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.Verified)]       // Verify
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.InProgress)]     // Reopen
    [InlineData(FieldTaskStatus.Verified, FieldTaskStatus.InProgress)] // Reopen
    public void Admin_AllWorkflowTransitions_AreAllowed(FieldTaskStatus from, FieldTaskStatus to)
    {
        Assert.True(_svc.CanTransition(Role.Admin, from, to));
    }

    [Theory]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.Done)]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.Verified)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Verified)]
    [InlineData(FieldTaskStatus.Verified, FieldTaskStatus.Done)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Created)]
    public void Admin_NonWorkflowJumps_AreNotAllowed(FieldTaskStatus from, FieldTaskStatus to)
    {
        Assert.False(_svc.CanTransition(Role.Admin, from, to));
    }

    // ---- No-op (same -> same) ----

    [Theory]
    [InlineData(FieldTaskStatus.Created)]
    [InlineData(FieldTaskStatus.InProgress)]
    [InlineData(FieldTaskStatus.Done)]
    [InlineData(FieldTaskStatus.Verified)]
    public void NoOp_SameStatus_IsNeverAllowed_ForEitherRole(FieldTaskStatus status)
    {
        Assert.False(_svc.CanTransition(Role.Worker, status, status));
        Assert.False(_svc.CanTransition(Role.Admin, status, status));
    }

    // ---- IsAdminOnlyTarget ----

    [Theory]
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.Verified)]
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.InProgress)]
    [InlineData(FieldTaskStatus.Verified, FieldTaskStatus.InProgress)]
    public void IsAdminOnlyTarget_TrueForVerifyAndReopen(FieldTaskStatus from, FieldTaskStatus to)
    {
        Assert.True(_svc.IsAdminOnlyTarget(from, to));
    }

    [Theory]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.InProgress)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Done)]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.Done)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Verified)]
    public void IsAdminOnlyTarget_FalseForEverythingElse(FieldTaskStatus from, FieldTaskStatus to)
    {
        Assert.False(_svc.IsAdminOnlyTarget(from, to));
    }

    // ---- Validate: throws the right exception type ----

    [Theory]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.InProgress)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Done)]
    public void Validate_Worker_LegalForward_DoesNotThrow(FieldTaskStatus from, FieldTaskStatus to)
    {
        _svc.Validate(Role.Worker, from, to); // no throw == pass
    }

    [Theory]
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.Verified)]    // Verify
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.InProgress)]  // Reopen
    [InlineData(FieldTaskStatus.Verified, FieldTaskStatus.InProgress)] // Reopen
    public void Validate_Worker_AdminOnlyTarget_ThrowsForbidden(FieldTaskStatus from, FieldTaskStatus to)
    {
        Assert.Throws<ForbiddenException>(() => _svc.Validate(Role.Worker, from, to));
    }

    [Theory]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.Done)]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.Verified)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Verified)]
    public void Validate_Worker_StructurallyIllegal_ThrowsValidation(FieldTaskStatus from, FieldTaskStatus to)
    {
        // These are not Admin-only *targets* (architecture §8.2 footnote), so they surface as 400, not 403.
        Assert.Throws<ValidationException>(() => _svc.Validate(Role.Worker, from, to));
    }

    [Theory]
    [InlineData(FieldTaskStatus.Created)]
    [InlineData(FieldTaskStatus.Done)]
    public void Validate_NoOp_ThrowsValidation_ForBothRoles(FieldTaskStatus status)
    {
        Assert.Throws<ValidationException>(() => _svc.Validate(Role.Worker, status, status));
        Assert.Throws<ValidationException>(() => _svc.Validate(Role.Admin, status, status));
    }

    [Theory]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.InProgress)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Done)]
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.Verified)]
    [InlineData(FieldTaskStatus.Done, FieldTaskStatus.InProgress)]
    [InlineData(FieldTaskStatus.Verified, FieldTaskStatus.InProgress)]
    public void Validate_Admin_LegalTransitions_DoNotThrow(FieldTaskStatus from, FieldTaskStatus to)
    {
        _svc.Validate(Role.Admin, from, to); // no throw == pass
    }

    [Theory]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.Done)]
    [InlineData(FieldTaskStatus.Created, FieldTaskStatus.Verified)]
    [InlineData(FieldTaskStatus.InProgress, FieldTaskStatus.Verified)]
    public void Validate_Admin_IllegalJumps_ThrowValidation(FieldTaskStatus from, FieldTaskStatus to)
    {
        Assert.Throws<ValidationException>(() => _svc.Validate(Role.Admin, from, to));
    }
}
