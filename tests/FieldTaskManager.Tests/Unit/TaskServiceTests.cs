using FieldTaskManager.Api.Common;
using FieldTaskManager.Api.Contracts.Tasks;
using FieldTaskManager.Api.Data;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Security;
using FieldTaskManager.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace FieldTaskManager.Tests.Unit;

/// <summary>
/// TaskService against a real AppDbContext on an open in-memory SQLite connection, with a real
/// StatusTransitionService. Covers create validation, list role-scoping/filter/search/ordering,
/// ownership on get, status transition + audit comment, location/assignee updates, delete,
/// and the extended fields (icon, priority, labels, area).
/// </summary>
public class TaskServiceTests : IDisposable
{
    private readonly TestDb _db = new();
    private readonly StatusTransitionService _transitions = new();

    private readonly User _admin;
    private readonly User _worker;
    private readonly User _otherWorker;

    public TaskServiceTests()
    {
        _admin = _db.SeedUser(Role.Admin, "admin");
        _worker = _db.SeedUser(Role.Worker, "worker");
        _otherWorker = _db.SeedUser(Role.Worker, "worker2");
    }

    private TaskService NewService(AppDbContext ctx) => new(ctx, _transitions);

    private static CreateTaskRequest Create(
        Guid assigneeId,
        string title = "Inspect pump",
        string? description = null,
        string? icon = null,
        int? priority = null,
        string[]? labels = null,
        double latitude = 50.0,
        double longitude = 30.0,
        double[][]? area = null,
        DateTime? deadline = null) =>
        new(title, description, icon, priority, labels, latitude, longitude, area, assigneeId,
            deadline ?? DateTime.UtcNow.AddDays(1));

    // ---------- Create: validation ----------

    [Fact]
    public async Task Create_BlankTitle_ThrowsValidation()
    {
        using var ctx = _db.NewContext();
        var svc = NewService(ctx);
        await Assert.ThrowsAsync<ValidationException>(() =>
            svc.CreateAsync(Create(_worker.Id, title: "   "), CurrentUsers.For(_admin)));
    }

    [Theory]
    [InlineData(91.0, 30.0)]
    [InlineData(-91.0, 30.0)]
    [InlineData(50.0, 181.0)]
    [InlineData(50.0, -181.0)]
    public async Task Create_OutOfRangeCoordinates_ThrowsValidation(double lat, double lng)
    {
        using var ctx = _db.NewContext();
        var svc = NewService(ctx);
        await Assert.ThrowsAsync<ValidationException>(() =>
            svc.CreateAsync(Create(_worker.Id, latitude: lat, longitude: lng), CurrentUsers.For(_admin)));
    }

    [Fact]
    public async Task Create_AssigneeMustExist()
    {
        using var ctx = _db.NewContext();
        var svc = NewService(ctx);
        await Assert.ThrowsAsync<ValidationException>(() =>
            svc.CreateAsync(Create(Guid.NewGuid()), CurrentUsers.For(_admin)));
    }

    [Fact]
    public async Task Create_AssigneeMustBeWorker_NotAdmin()
    {
        using var ctx = _db.NewContext();
        var svc = NewService(ctx);
        await Assert.ThrowsAsync<ValidationException>(() =>
            svc.CreateAsync(Create(_admin.Id), CurrentUsers.For(_admin)));
    }

    [Fact]
    public async Task Create_MissingDeadline_ThrowsValidation()
    {
        using var ctx = _db.NewContext();
        var svc = NewService(ctx);
        var req = Create(_worker.Id, deadline: default(DateTime));
        await Assert.ThrowsAsync<ValidationException>(() => svc.CreateAsync(req, CurrentUsers.For(_admin)));
    }

    [Fact]
    public async Task Create_Persists_WithCreatedStatus_AndTimestamps()
    {
        Guid id;
        using (var ctx = _db.NewContext())
        {
            var dto = await NewService(ctx).CreateAsync(
                Create(_worker.Id, title: "  Fix valve  ", description: "  near the gate  "),
                CurrentUsers.For(_admin));
            id = dto.Id;
            Assert.Equal(FieldTaskStatus.Created, dto.Status);
            Assert.Equal("Fix valve", dto.Title);              // trimmed
            Assert.Equal("near the gate", dto.Description);    // trimmed
            Assert.Equal(_worker.DisplayName, dto.AssigneeName);
            Assert.NotEqual(default, dto.CreatedAtUtc);
            Assert.NotEqual(default, dto.UpdatedAtUtc);
        }

        using var verify = _db.NewContext();
        var stored = await verify.FieldTasks.FindAsync(id);
        Assert.NotNull(stored);
        Assert.Equal(FieldTaskStatus.Created, stored!.Status);
    }

    // ---------- Create: extended fields ----------

    [Fact]
    public async Task Create_IconDefaults_WhenNullOrBlank()
    {
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).CreateAsync(
            Create(_worker.Id, icon: "   "), CurrentUsers.For(_admin));
        Assert.Equal("📍", dto.Icon);
    }

    [Fact]
    public async Task Create_IconTrimmed_WhenProvided()
    {
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).CreateAsync(
            Create(_worker.Id, icon: " 🔧 "), CurrentUsers.For(_admin));
        Assert.Equal("🔧", dto.Icon);
    }

    [Fact]
    public async Task Create_PriorityLow_Persists_NotCoercedToMedium()
    {
        Guid id;
        using (var ctx = _db.NewContext())
        {
            var dto = await NewService(ctx).CreateAsync(
                Create(_worker.Id, priority: (int)Priority.Low), CurrentUsers.For(_admin));
            Assert.Equal(Priority.Low, dto.Priority);
            id = dto.Id;
        }

        using var verify = _db.NewContext();
        var stored = await verify.FieldTasks.FindAsync(id);
        Assert.Equal(Priority.Low, stored!.Priority);
    }

    [Fact]
    public async Task Create_PriorityDefaultsToMedium_WhenNullOrOutOfRange()
    {
        using var ctx = _db.NewContext();
        var svc = NewService(ctx);
        var none = await svc.CreateAsync(Create(_worker.Id, priority: null), CurrentUsers.For(_admin));
        Assert.Equal(Priority.Medium, none.Priority);

        var bad = await svc.CreateAsync(Create(_worker.Id, priority: 99), CurrentUsers.For(_admin));
        Assert.Equal(Priority.Medium, bad.Priority);
    }

    [Fact]
    public async Task Create_Labels_AreNormalized_TrimmedNonEmpty_CappedTo30Chars_And10Entries()
    {
        var labels = new[]
        {
            "  alpha  ",                    // trimmed
            "",                             // dropped (empty)
            "   ",                          // dropped (whitespace)
            new string('x', 40),            // capped to 30
            "b1","b2","b3","b4","b5","b6","b7","b8","b9","b10" // pushes total over 10
        };

        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).CreateAsync(
            Create(_worker.Id, labels: labels), CurrentUsers.For(_admin));

        Assert.Equal(10, dto.Labels.Length);                // capped to 10
        Assert.Equal("alpha", dto.Labels[0]);               // trimmed, kept
        Assert.Equal(30, dto.Labels[1].Length);             // long one capped to 30
        Assert.DoesNotContain(dto.Labels, l => l.Length == 0);
    }

    // ---------- Create: area ----------

    [Fact]
    public async Task Create_Area_WithThreePoints_RoundTrips()
    {
        var area = new[]
        {
            new[] { 50.1, 30.2 },
            new[] { 50.2, 30.3 },
            new[] { 50.15, 30.35 }
        };

        Guid id;
        using (var ctx = _db.NewContext())
        {
            var dto = await NewService(ctx).CreateAsync(
                Create(_worker.Id, area: area), CurrentUsers.For(_admin));
            Assert.NotNull(dto.Area);
            Assert.Equal(3, dto.Area!.Length);
            Assert.Equal(50.1, dto.Area[0][0]);
            Assert.Equal(30.2, dto.Area[0][1]);
            id = dto.Id;
        }

        using var verify = _db.NewContext();
        var read = await NewService(verify).GetAsync(id, CurrentUsers.For(_admin));
        Assert.NotNull(read.Area);
        Assert.Equal(3, read.Area!.Length);
    }

    [Fact]
    public async Task Create_Area_FewerThanThreePoints_StoredAsNull()
    {
        var area = new[] { new[] { 50.1, 30.2 }, new[] { 50.2, 30.3 } };
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).CreateAsync(
            Create(_worker.Id, area: area), CurrentUsers.For(_admin));
        Assert.Null(dto.Area);
    }

    [Fact]
    public async Task Create_Area_WithBadCoordinate_ThrowsValidation()
    {
        var area = new[]
        {
            new[] { 50.1, 30.2 },
            new[] { 999.0, 30.3 },  // latitude out of range
            new[] { 50.15, 30.35 }
        };
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<ValidationException>(() =>
            NewService(ctx).CreateAsync(Create(_worker.Id, area: area), CurrentUsers.For(_admin)));
    }

    [Fact]
    public async Task Create_Area_WithMalformedPair_ThrowsValidation()
    {
        var area = new[]
        {
            new[] { 50.1, 30.2 },
            new[] { 50.2 },         // not a [lat,lng] pair
            new[] { 50.15, 30.35 }
        };
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<ValidationException>(() =>
            NewService(ctx).CreateAsync(Create(_worker.Id, area: area), CurrentUsers.For(_admin)));
    }

    // ---------- List: role scoping ----------

    [Fact]
    public async Task List_Worker_SeesOnlyOwnTasks()
    {
        _db.SeedTask(_worker.Id, title: "mine-1");
        _db.SeedTask(_worker.Id, title: "mine-2");
        _db.SeedTask(_otherWorker.Id, title: "theirs");

        using var ctx = _db.NewContext();
        var list = await NewService(ctx).ListAsync(new TaskQuery(null, null, null), CurrentUsers.For(_worker));

        Assert.Equal(2, list.Count);
        Assert.All(list, t => Assert.Equal(_worker.Id, t.AssigneeId));
    }

    [Fact]
    public async Task List_Admin_SeesAllTasks()
    {
        _db.SeedTask(_worker.Id);
        _db.SeedTask(_otherWorker.Id);

        using var ctx = _db.NewContext();
        var list = await NewService(ctx).ListAsync(new TaskQuery(null, null, null), CurrentUsers.For(_admin));

        Assert.Equal(2, list.Count);
    }

    [Fact]
    public async Task List_Admin_AssigneeFilter_NarrowsResults()
    {
        _db.SeedTask(_worker.Id);
        _db.SeedTask(_otherWorker.Id);

        using var ctx = _db.NewContext();
        var list = await NewService(ctx).ListAsync(
            new TaskQuery(null, null, _otherWorker.Id), CurrentUsers.For(_admin));

        Assert.Single(list);
        Assert.Equal(_otherWorker.Id, list[0].AssigneeId);
    }

    [Fact]
    public async Task List_Worker_AssigneeFilterIsIgnored_StillScopedToSelf()
    {
        _db.SeedTask(_worker.Id);
        _db.SeedTask(_otherWorker.Id);

        using var ctx = _db.NewContext();
        // Worker tries to view another worker's tasks via assigneeId; the param must be ignored.
        var list = await NewService(ctx).ListAsync(
            new TaskQuery(null, null, _otherWorker.Id), CurrentUsers.For(_worker));

        Assert.Single(list);
        Assert.Equal(_worker.Id, list[0].AssigneeId);
    }

    [Fact]
    public async Task List_StatusFilter_ReturnsOnlyMatchingStatus()
    {
        _db.SeedTask(_worker.Id, FieldTaskStatus.Created);
        _db.SeedTask(_worker.Id, FieldTaskStatus.Done);
        _db.SeedTask(_worker.Id, FieldTaskStatus.Done);

        using var ctx = _db.NewContext();
        var list = await NewService(ctx).ListAsync(
            new TaskQuery(null, FieldTaskStatus.Done, null), CurrentUsers.For(_worker));

        Assert.Equal(2, list.Count);
        Assert.All(list, t => Assert.Equal(FieldTaskStatus.Done, t.Status));
    }

    [Fact]
    public async Task List_Search_IsCaseInsensitive_OnTitleOrDescription()
    {
        using (var ctx = _db.NewContext())
        {
            var svc = NewService(ctx);
            await svc.CreateAsync(Create(_worker.Id, title: "Replace PUMP gasket"), CurrentUsers.For(_admin));
            await svc.CreateAsync(Create(_worker.Id, title: "Paint fence", description: "Use the green Pump shed paint"), CurrentUsers.For(_admin));
            await svc.CreateAsync(Create(_worker.Id, title: "Mow lawn"), CurrentUsers.For(_admin));
        }

        using var read = _db.NewContext();
        var list = await NewService(read).ListAsync(
            new TaskQuery("pump", null, null), CurrentUsers.For(_admin));

        Assert.Equal(2, list.Count); // title match + description match, case-insensitive
    }

    [Fact]
    public async Task List_EmptySearch_ReturnsFullScope()
    {
        _db.SeedTask(_worker.Id);
        _db.SeedTask(_worker.Id);

        using var ctx = _db.NewContext();
        var list = await NewService(ctx).ListAsync(
            new TaskQuery("   ", null, null), CurrentUsers.For(_worker));

        Assert.Equal(2, list.Count);
    }

    [Fact]
    public async Task List_OrderedByDeadlineAscending()
    {
        var now = DateTime.UtcNow;
        _db.SeedTask(_worker.Id, title: "late", deadline: now.AddDays(10));
        _db.SeedTask(_worker.Id, title: "soon", deadline: now.AddDays(1));
        _db.SeedTask(_worker.Id, title: "mid", deadline: now.AddDays(5));

        using var ctx = _db.NewContext();
        var list = await NewService(ctx).ListAsync(new TaskQuery(null, null, null), CurrentUsers.For(_worker));

        Assert.Equal(new[] { "soon", "mid", "late" }, list.Select(t => t.Title).ToArray());
    }

    [Fact]
    public async Task List_IncludesAttachmentCount()
    {
        var task = _db.SeedTask(_worker.Id);
        using (var ctx = _db.NewContext())
        {
            ctx.Attachments.Add(new Attachment
            {
                Id = Guid.NewGuid(),
                FieldTaskId = task.Id,
                FileName = "a.txt",
                ContentType = "text/plain",
                SizeBytes = 3,
                StoredName = "x.txt",
                UploadedById = _worker.Id,
                UploadedAtUtc = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();
        }

        using var read = _db.NewContext();
        var list = await NewService(read).ListAsync(new TaskQuery(null, null, null), CurrentUsers.For(_admin));
        Assert.Equal(1, list.Single().AttachmentCount);
    }

    // ---------- Get: ownership ----------

    [Fact]
    public async Task Get_Worker_NonOwner_ThrowsNotFound()
    {
        var task = _db.SeedTask(_otherWorker.Id);
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewService(ctx).GetAsync(task.Id, CurrentUsers.For(_worker)));
    }

    [Fact]
    public async Task Get_MissingTask_ThrowsNotFound()
    {
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewService(ctx).GetAsync(Guid.NewGuid(), CurrentUsers.For(_admin)));
    }

    [Fact]
    public async Task Get_Admin_CanReadAnyTask()
    {
        var task = _db.SeedTask(_otherWorker.Id);
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).GetAsync(task.Id, CurrentUsers.For(_admin));
        Assert.Equal(task.Id, dto.Id);
    }

    // ---------- UpdateStatus: transition + audit comment ----------

    [Fact]
    public async Task UpdateStatus_Worker_AppliesTransition_AndAppendsAuditComment()
    {
        var task = _db.SeedTask(_worker.Id, FieldTaskStatus.Created);

        using (var ctx = _db.NewContext())
        {
            var dto = await NewService(ctx).UpdateStatusAsync(
                task.Id, new UpdateStatusRequest(FieldTaskStatus.InProgress), CurrentUsers.For(_worker));
            Assert.Equal(FieldTaskStatus.InProgress, dto.Status);
        }

        using var verify = _db.NewContext();
        var stored = await verify.FieldTasks.FindAsync(task.Id);
        Assert.Equal(FieldTaskStatus.InProgress, stored!.Status);

        var comments = await verify.Comments.Where(c => c.FieldTaskId == task.Id).ToListAsync();
        var audit = Assert.Single(comments);
        Assert.Equal(_worker.Id, audit.AuthorId);
        Assert.Contains("[status]", audit.Body);
        Assert.Contains("Created -> InProgress", audit.Body);
    }

    [Fact]
    public async Task UpdateStatus_Worker_ForbiddenVerify_ThrowsForbidden()
    {
        var task = _db.SeedTask(_worker.Id, FieldTaskStatus.Done);
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<ForbiddenException>(() =>
            NewService(ctx).UpdateStatusAsync(
                task.Id, new UpdateStatusRequest(FieldTaskStatus.Verified), CurrentUsers.For(_worker)));
    }

    [Fact]
    public async Task UpdateStatus_Worker_IllegalJump_ThrowsValidation()
    {
        var task = _db.SeedTask(_worker.Id, FieldTaskStatus.Created);
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<ValidationException>(() =>
            NewService(ctx).UpdateStatusAsync(
                task.Id, new UpdateStatusRequest(FieldTaskStatus.Done), CurrentUsers.For(_worker)));
    }

    [Fact]
    public async Task UpdateStatus_Worker_NonOwner_ThrowsNotFound()
    {
        var task = _db.SeedTask(_otherWorker.Id, FieldTaskStatus.Created);
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewService(ctx).UpdateStatusAsync(
                task.Id, new UpdateStatusRequest(FieldTaskStatus.InProgress), CurrentUsers.For(_worker)));
    }

    [Fact]
    public async Task UpdateStatus_Admin_Verify_Succeeds()
    {
        var task = _db.SeedTask(_otherWorker.Id, FieldTaskStatus.Done);
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).UpdateStatusAsync(
            task.Id, new UpdateStatusRequest(FieldTaskStatus.Verified), CurrentUsers.For(_admin));
        Assert.Equal(FieldTaskStatus.Verified, dto.Status);
    }

    [Fact]
    public async Task UpdateStatus_Admin_Reopen_FromVerified_Succeeds()
    {
        var task = _db.SeedTask(_otherWorker.Id, FieldTaskStatus.Verified);
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).UpdateStatusAsync(
            task.Id, new UpdateStatusRequest(FieldTaskStatus.InProgress), CurrentUsers.For(_admin));
        Assert.Equal(FieldTaskStatus.InProgress, dto.Status);
    }

    [Fact]
    public async Task UpdateStatus_NoOp_ThrowsValidation()
    {
        var task = _db.SeedTask(_otherWorker.Id, FieldTaskStatus.Created);
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<ValidationException>(() =>
            NewService(ctx).UpdateStatusAsync(
                task.Id, new UpdateStatusRequest(FieldTaskStatus.Created), CurrentUsers.For(_admin)));
    }

    // ---------- UpdateLocation ----------

    [Fact]
    public async Task UpdateLocation_PersistsNewCoordinates()
    {
        var task = _db.SeedTask(_worker.Id);
        using (var ctx = _db.NewContext())
        {
            var dto = await NewService(ctx).UpdateLocationAsync(
                task.Id, new UpdateLocationRequest(12.5, -77.25), CurrentUsers.For(_admin));
            Assert.Equal(12.5, dto.Latitude);
            Assert.Equal(-77.25, dto.Longitude);
        }

        using var verify = _db.NewContext();
        var stored = await verify.FieldTasks.FindAsync(task.Id);
        Assert.Equal(12.5, stored!.Latitude);
        Assert.Equal(-77.25, stored.Longitude);
    }

    [Fact]
    public async Task UpdateLocation_OutOfRange_ThrowsValidation()
    {
        var task = _db.SeedTask(_worker.Id);
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<ValidationException>(() =>
            NewService(ctx).UpdateLocationAsync(
                task.Id, new UpdateLocationRequest(95.0, 0.0), CurrentUsers.For(_admin)));
    }

    // ---------- UpdateAssignee ----------

    [Fact]
    public async Task UpdateAssignee_ReassignsToAnotherWorker()
    {
        var task = _db.SeedTask(_worker.Id);
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).UpdateAssigneeAsync(
            task.Id, new UpdateAssigneeRequest(_otherWorker.Id), CurrentUsers.For(_admin));
        Assert.Equal(_otherWorker.Id, dto.AssigneeId);
        Assert.Equal(_otherWorker.DisplayName, dto.AssigneeName);
    }

    [Fact]
    public async Task UpdateAssignee_NonWorker_ThrowsValidation()
    {
        var task = _db.SeedTask(_worker.Id);
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<ValidationException>(() =>
            NewService(ctx).UpdateAssigneeAsync(
                task.Id, new UpdateAssigneeRequest(_admin.Id), CurrentUsers.For(_admin)));
    }

    // ---------- Update (PUT) ----------

    [Fact]
    public async Task Update_PersistsFieldChanges_AndReassigns()
    {
        var task = _db.SeedTask(_worker.Id, title: "old");
        using (var ctx = _db.NewContext())
        {
            var req = new UpdateTaskRequest("new title", "desc", "🚧", (int)Priority.High,
                new[] { "urgent" }, null, _otherWorker.Id, DateTime.UtcNow.AddDays(3));
            var dto = await NewService(ctx).UpdateAsync(task.Id, req, CurrentUsers.For(_admin));
            Assert.Equal("new title", dto.Title);
            Assert.Equal(Priority.High, dto.Priority);
            Assert.Equal(_otherWorker.Id, dto.AssigneeId);
            Assert.Contains("urgent", dto.Labels);
        }

        using var verify = _db.NewContext();
        var stored = await verify.FieldTasks.FindAsync(task.Id);
        Assert.Equal("new title", stored!.Title);
        Assert.Equal(_otherWorker.Id, stored.AssigneeId);
    }

    [Fact]
    public async Task Update_BlankTitle_ThrowsValidation()
    {
        var task = _db.SeedTask(_worker.Id);
        using var ctx = _db.NewContext();
        var req = new UpdateTaskRequest("  ", null, null, null, null, null, _worker.Id, DateTime.UtcNow.AddDays(1));
        await Assert.ThrowsAsync<ValidationException>(() =>
            NewService(ctx).UpdateAsync(task.Id, req, CurrentUsers.For(_admin)));
    }

    [Fact]
    public async Task Update_MissingTask_ThrowsNotFound()
    {
        using var ctx = _db.NewContext();
        var req = new UpdateTaskRequest("x", null, null, null, null, null, _worker.Id, DateTime.UtcNow.AddDays(1));
        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewService(ctx).UpdateAsync(Guid.NewGuid(), req, CurrentUsers.For(_admin)));
    }

    // ---------- Delete ----------

    [Fact]
    public async Task Delete_RemovesTask_AndCascadesComments()
    {
        var task = _db.SeedTask(_worker.Id);
        using (var ctx = _db.NewContext())
        {
            ctx.Comments.Add(new Comment
            {
                Id = Guid.NewGuid(),
                FieldTaskId = task.Id,
                AuthorId = _worker.Id,
                Body = "note",
                CreatedAtUtc = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();
        }

        using (var ctx = _db.NewContext())
        {
            await NewService(ctx).DeleteAsync(task.Id, CurrentUsers.For(_admin));
        }

        using var verify = _db.NewContext();
        Assert.Null(await verify.FieldTasks.FindAsync(task.Id));
        Assert.False(await verify.Comments.AnyAsync(c => c.FieldTaskId == task.Id)); // no orphans
    }

    [Fact]
    public async Task Delete_MissingTask_ThrowsNotFound()
    {
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewService(ctx).DeleteAsync(Guid.NewGuid(), CurrentUsers.For(_admin)));
    }

    public void Dispose() => _db.Dispose();
}
