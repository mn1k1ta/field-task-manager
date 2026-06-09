using System.Net;
using System.Net.Http.Json;

namespace FieldTaskManager.Tests.Integration;

/// <summary>
/// HTTP-level task CRUD, role scoping, ownership, status transitions, location/assignee updates,
/// filtering/search, and the extended-field round-trips (icon/priority/labels/area).
/// </summary>
public class TaskEndpointsTests : IntegrationTestBase
{
    // ---------- Create ----------

    [Fact]
    public async Task Create_Admin_201()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();

        var task = await CreateTaskAsync(admin, worker.Id, title: "Repair line");
        Assert.Equal(Wire.StatusCreated, task.Status);
        Assert.Equal(worker.Id, task.AssigneeId);
    }

    [Fact]
    public async Task Create_Worker_403()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var response = await worker.PostJsonAsync("/api/tasks", new
        {
            title = "should fail",
            latitude = 50.0,
            longitude = 30.0,
            assigneeId = self.Id,
            deadline = DateTime.UtcNow.AddDays(1)
        });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Create_BlankTitle_400()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var response = await admin.PostJsonAsync("/api/tasks", new
        {
            title = "",
            latitude = 50.0,
            longitude = 30.0,
            assigneeId = worker.Id,
            deadline = DateTime.UtcNow.AddDays(1)
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_NonWorkerAssignee_400()
    {
        var admin = await AdminClientAsync();
        var me = await ApiClient.ReadAsync<UserModel>(await admin.Http.GetAsync("/api/auth/me"));
        // Assigning to the admin (not a Worker) must be rejected.
        var response = await admin.PostJsonAsync("/api/tasks", new
        {
            title = "bad assignee",
            latitude = 50.0,
            longitude = 30.0,
            assigneeId = me.Id,
            deadline = DateTime.UtcNow.AddDays(1)
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_OutOfRangeLatitude_400()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var response = await admin.PostJsonAsync("/api/tasks", new
        {
            title = "bad coords",
            latitude = 200.0,
            longitude = 30.0,
            assigneeId = worker.Id,
            deadline = DateTime.UtcNow.AddDays(1)
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---------- List scoping ----------

    [Fact]
    public async Task List_Worker_SeesOnlyOwn()
    {
        var (workerA, a) = await NewWorkerClientAsync("a");
        var (_, b) = await NewWorkerClientAsync("b");
        var admin = await AdminClientAsync();

        await CreateTaskAsync(admin, a.Id, title: "for-a");
        await CreateTaskAsync(admin, b.Id, title: "for-b");

        var response = await workerA.Http.GetAsync("/api/tasks");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var list = await ApiClient.ReadAsync<List<TaskModel>>(response);
        Assert.All(list, t => Assert.Equal(a.Id, t.AssigneeId));
        Assert.Contains(list, t => t.Title == "for-a");
        Assert.DoesNotContain(list, t => t.Title == "for-b");
    }

    [Fact]
    public async Task List_Admin_SeesAll()
    {
        var (_, a) = await NewWorkerClientAsync("a");
        var (_, b) = await NewWorkerClientAsync("b");
        var admin = await AdminClientAsync();
        await CreateTaskAsync(admin, a.Id, title: "for-a");
        await CreateTaskAsync(admin, b.Id, title: "for-b");

        var list = await ApiClient.ReadAsync<List<TaskModel>>(await admin.Http.GetAsync("/api/tasks"));
        Assert.Contains(list, t => t.Title == "for-a");
        Assert.Contains(list, t => t.Title == "for-b");
    }

    // ---------- Get ownership ----------

    [Fact]
    public async Task Get_Worker_OtherTask_404()
    {
        var (_, a) = await NewWorkerClientAsync("a");
        var (workerB, _) = await NewWorkerClientAsync("b");
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, a.Id);

        var response = await workerB.Http.GetAsync($"/api/tasks/{task.Id}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Get_Owner_200()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        var response = await worker.Http.GetAsync($"/api/tasks/{task.Id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var read = await ApiClient.ReadAsync<TaskModel>(response);
        Assert.Equal(task.Id, read.Id);
    }

    // ---------- Update / Delete ----------

    [Fact]
    public async Task Update_Admin_200_PersistsChanges()
    {
        var (_, a) = await NewWorkerClientAsync("a");
        var (_, b) = await NewWorkerClientAsync("b");
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, a.Id, title: "old");

        var response = await admin.PutJsonAsync($"/api/tasks/{task.Id}", new
        {
            title = "renamed",
            description = "updated",
            assigneeId = b.Id,
            deadline = DateTime.UtcNow.AddDays(5)
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await ApiClient.ReadAsync<TaskModel>(response);
        Assert.Equal("renamed", updated.Title);
        Assert.Equal(b.Id, updated.AssigneeId);
    }

    [Fact]
    public async Task Delete_Worker_403()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        var response = await worker.Http.DeleteAsync($"/api/tasks/{task.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        // The task still exists (admin can still read it).
        var stillThere = await admin.Http.GetAsync($"/api/tasks/{task.Id}");
        Assert.Equal(HttpStatusCode.OK, stillThere.StatusCode);
    }

    [Fact]
    public async Task Delete_Admin_204()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, worker.Id);

        var response = await admin.Http.DeleteAsync($"/api/tasks/{task.Id}");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var gone = await admin.Http.GetAsync($"/api/tasks/{task.Id}");
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
    }

    // ---------- Status transitions ----------

    [Fact]
    public async Task Status_Worker_CreatedToInProgressToDone_Ok()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        var start = await worker.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusInProgress });
        Assert.Equal(HttpStatusCode.OK, start.StatusCode);
        Assert.Equal(Wire.StatusInProgress, (await ApiClient.ReadAsync<TaskModel>(start)).Status);

        var done = await worker.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusDone });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);
        Assert.Equal(Wire.StatusDone, (await ApiClient.ReadAsync<TaskModel>(done)).Status);
    }

    [Fact]
    public async Task Status_Worker_Verify_403()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        // Drive it to Done first (legitimately).
        await worker.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusInProgress });
        await worker.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusDone });

        var verify = await worker.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusVerified });
        Assert.Equal(HttpStatusCode.Forbidden, verify.StatusCode);
    }

    [Fact]
    public async Task Status_Worker_IllegalJump_400()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        // Created -> Done is structurally illegal (not an admin-only target) => 400.
        var jump = await worker.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusDone });
        Assert.Equal(HttpStatusCode.BadRequest, jump.StatusCode);
    }

    [Fact]
    public async Task Status_Admin_Verify_200_Then_Reopen_200()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        await worker.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusInProgress });
        await worker.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusDone });

        var verify = await admin.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusVerified });
        Assert.Equal(HttpStatusCode.OK, verify.StatusCode);
        Assert.Equal(Wire.StatusVerified, (await ApiClient.ReadAsync<TaskModel>(verify)).Status);

        var reopen = await admin.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusInProgress });
        Assert.Equal(HttpStatusCode.OK, reopen.StatusCode);
        Assert.Equal(Wire.StatusInProgress, (await ApiClient.ReadAsync<TaskModel>(reopen)).Status);
    }

    [Fact]
    public async Task Status_Admin_VerifyFromCreated_400()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, worker.Id);

        var verify = await admin.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusVerified });
        Assert.Equal(HttpStatusCode.BadRequest, verify.StatusCode);
    }

    [Fact]
    public async Task Status_Worker_NonOwner_404()
    {
        var (_, owner) = await NewWorkerClientAsync("owner");
        var (intruder, _) = await NewWorkerClientAsync("intruder");
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, owner.Id);

        var response = await intruder.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusInProgress });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---------- Location ----------

    [Fact]
    public async Task Location_Admin_200_Persists()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, worker.Id);

        var response = await admin.PatchJsonAsync($"/api/tasks/{task.Id}/location", new { latitude = 10.0, longitude = 20.0 });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await ApiClient.ReadAsync<TaskModel>(response);
        Assert.Equal(10.0, updated.Latitude);
        Assert.Equal(20.0, updated.Longitude);
    }

    [Fact]
    public async Task Location_Worker_403()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        var response = await worker.PatchJsonAsync($"/api/tasks/{task.Id}/location", new { latitude = 10.0, longitude = 20.0 });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ---------- Assignee ----------

    [Fact]
    public async Task Assignee_Admin_200()
    {
        var (_, a) = await NewWorkerClientAsync("a");
        var (_, b) = await NewWorkerClientAsync("b");
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, a.Id);

        var response = await admin.PatchJsonAsync($"/api/tasks/{task.Id}/assignee", new { assigneeId = b.Id });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(b.Id, (await ApiClient.ReadAsync<TaskModel>(response)).AssigneeId);
    }

    [Fact]
    public async Task Assignee_NonWorker_400()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var me = await ApiClient.ReadAsync<UserModel>(await admin.Http.GetAsync("/api/auth/me"));
        var task = await CreateTaskAsync(admin, worker.Id);

        var response = await admin.PatchJsonAsync($"/api/tasks/{task.Id}/assignee", new { assigneeId = me.Id });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Reassign_OldAssigneeLosesVisibility_NewGains()
    {
        var (clientA, a) = await NewWorkerClientAsync("a");
        var (clientB, b) = await NewWorkerClientAsync("b");
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, a.Id);

        await admin.PatchJsonAsync($"/api/tasks/{task.Id}/assignee", new { assigneeId = b.Id });

        var aSees = await clientA.Http.GetAsync($"/api/tasks/{task.Id}");
        Assert.Equal(HttpStatusCode.NotFound, aSees.StatusCode);

        var bSees = await clientB.Http.GetAsync($"/api/tasks/{task.Id}");
        Assert.Equal(HttpStatusCode.OK, bSees.StatusCode);
    }

    // ---------- Filter + search ----------

    [Fact]
    public async Task Filter_ByStatus_ReturnsOnlyMatching()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var created = await CreateTaskAsync(admin, self.Id, title: "stays-created");
        var toAdvance = await CreateTaskAsync(admin, self.Id, title: "advanced");
        await worker.PatchJsonAsync($"/api/tasks/{toAdvance.Id}/status", new { status = Wire.StatusInProgress });

        var list = await ApiClient.ReadAsync<List<TaskModel>>(
            await admin.Http.GetAsync($"/api/tasks?status={Wire.StatusInProgress}"));

        Assert.Contains(list, t => t.Id == toAdvance.Id);
        Assert.DoesNotContain(list, t => t.Id == created.Id);
    }

    [Fact]
    public async Task Search_CaseInsensitive_MatchesTitleOrDescription()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        await CreateTaskAsync(admin, worker.Id, title: "Replace PUMP gasket");
        await CreateTaskAsync(admin, worker.Id, title: "Paint fence", description: "near the pump house");
        await CreateTaskAsync(admin, worker.Id, title: "Mow lawn");

        var list = await ApiClient.ReadAsync<List<TaskModel>>(await admin.Http.GetAsync("/api/tasks?search=pump"));
        Assert.Equal(2, list.Count(t => t.Title is "Replace PUMP gasket" or "Paint fence"));
        Assert.DoesNotContain(list, t => t.Title == "Mow lawn");
    }

    [Fact]
    public async Task Search_NonMatching_ReturnsEmpty_NoError()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        await CreateTaskAsync(admin, worker.Id, title: "Mow lawn");

        var response = await admin.Http.GetAsync("/api/tasks?search=zzz-no-match");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var list = await ApiClient.ReadAsync<List<TaskModel>>(response);
        Assert.Empty(list);
    }

    // ---------- Extended fields round-trip ----------

    [Fact]
    public async Task IconPriorityLabels_RoundTrip()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, worker.Id,
            icon: "🔧", priority: Wire.PriorityHigh, labels: new[] { "electrical", "urgent" });

        Assert.Equal("🔧", task.Icon);
        Assert.Equal(Wire.PriorityHigh, task.Priority);
        Assert.Contains("electrical", task.Labels);
        Assert.Contains("urgent", task.Labels);

        // Survives a re-read.
        var read = await ApiClient.ReadAsync<TaskModel>(await admin.Http.GetAsync($"/api/tasks/{task.Id}"));
        Assert.Equal("🔧", read.Icon);
        Assert.Equal(2, read.Labels.Length);
    }

    [Fact]
    public async Task PriorityLow_Zero_Persists_NotCoercedToMedium()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, worker.Id, priority: Wire.PriorityLow);
        Assert.Equal(Wire.PriorityLow, task.Priority);

        var read = await ApiClient.ReadAsync<TaskModel>(await admin.Http.GetAsync($"/api/tasks/{task.Id}"));
        Assert.Equal(Wire.PriorityLow, read.Priority);
    }

    [Fact]
    public async Task Area_ThreePoints_RoundTrip()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var area = new[]
        {
            new[] { 50.1, 30.2 },
            new[] { 50.2, 30.3 },
            new[] { 50.15, 30.35 }
        };
        var task = await CreateTaskAsync(admin, worker.Id, area: area);
        Assert.NotNull(task.Area);
        Assert.Equal(3, task.Area!.Length);

        var read = await ApiClient.ReadAsync<TaskModel>(await admin.Http.GetAsync($"/api/tasks/{task.Id}"));
        Assert.NotNull(read.Area);
        Assert.Equal(3, read.Area!.Length);
    }

    [Fact]
    public async Task Area_FewerThanThreePoints_StoredAsNull()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var area = new[] { new[] { 50.1, 30.2 }, new[] { 50.2, 30.3 } };
        var task = await CreateTaskAsync(admin, worker.Id, area: area);
        Assert.Null(task.Area);
    }

    [Fact]
    public async Task Area_BadCoordinate_400()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var response = await admin.PostJsonAsync("/api/tasks", new
        {
            title = "bad area",
            latitude = 50.0,
            longitude = 30.0,
            area = new[]
            {
                new[] { 50.1, 30.2 },
                new[] { 999.0, 30.3 },
                new[] { 50.15, 30.35 }
            },
            assigneeId = worker.Id,
            deadline = DateTime.UtcNow.AddDays(1)
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
