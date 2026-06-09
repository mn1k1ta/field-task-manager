using System.Net;

namespace FieldTaskManager.Tests.Integration;

/// <summary>
/// HTTP-level comments: owner can post (201), empty body (400), cross-worker (404), and the list
/// includes the status-audit comments that the status transition appends (architecture §8.3).
/// </summary>
public class CommentEndpointsTests : IntegrationTestBase
{
    [Fact]
    public async Task Post_Owner_201()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        var response = await worker.PostJsonAsync($"/api/tasks/{task.Id}/comments", new { body = "on my way" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var comment = await ApiClient.ReadAsync<CommentModel>(response);
        Assert.Equal("on my way", comment.Body);
        Assert.Equal(self.Id, comment.AuthorId);
    }

    [Fact]
    public async Task Post_EmptyBody_400()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        var response = await worker.PostJsonAsync($"/api/tasks/{task.Id}/comments", new { body = "   " });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Post_CrossWorker_404()
    {
        var (_, owner) = await NewWorkerClientAsync("owner");
        var (intruder, _) = await NewWorkerClientAsync("intruder");
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, owner.Id);

        var response = await intruder.PostJsonAsync($"/api/tasks/{task.Id}/comments", new { body = "sneaky" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task List_OldestToNewest_WithAuthorAndTime()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        await worker.PostJsonAsync($"/api/tasks/{task.Id}/comments", new { body = "first" });
        await Task.Delay(10);
        await admin.PostJsonAsync($"/api/tasks/{task.Id}/comments", new { body = "second" });

        var list = await ApiClient.ReadAsync<List<CommentModel>>(
            await worker.Http.GetAsync($"/api/tasks/{task.Id}/comments"));

        Assert.Equal("first", list[0].Body);
        Assert.Equal("second", list[1].Body);
        Assert.All(list, c => Assert.False(string.IsNullOrEmpty(c.AuthorName)));
        Assert.All(list, c => Assert.NotEqual(default, c.CreatedAtUtc));
    }

    [Fact]
    public async Task List_IncludesStatusAuditComments()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        // A status transition appends an audit comment (§8.3).
        await worker.PatchJsonAsync($"/api/tasks/{task.Id}/status", new { status = Wire.StatusInProgress });

        var list = await ApiClient.ReadAsync<List<CommentModel>>(
            await worker.Http.GetAsync($"/api/tasks/{task.Id}/comments"));

        Assert.Contains(list, c => c.Body.Contains("[status]") && c.Body.Contains("Created -> InProgress"));
    }

    [Fact]
    public async Task List_CrossWorker_404()
    {
        var (_, owner) = await NewWorkerClientAsync("owner");
        var (intruder, _) = await NewWorkerClientAsync("intruder");
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, owner.Id);

        var response = await intruder.Http.GetAsync($"/api/tasks/{task.Id}/comments");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
