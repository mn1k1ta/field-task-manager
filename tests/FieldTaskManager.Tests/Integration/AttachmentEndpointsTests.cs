using System.Net;
using System.Net.Http.Headers;

namespace FieldTaskManager.Tests.Integration;

/// <summary>
/// HTTP-level attachments: multipart upload (field name 'file') -> 201 with isImage; list; content
/// download (auth 200 bytes / unauth 401); the 10 MB limit -> 400; delete authority
/// (uploader/admin 204, cross-worker 404).
/// </summary>
public class AttachmentEndpointsTests : IntegrationTestBase
{
    private static MultipartFormDataContent FileContent(byte[] bytes, string fileName, string contentType)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        // The controller binds an IFormFile parameter named "file".
        return new MultipartFormDataContent { { content, "file", fileName } };
    }

    private static async Task<AttachmentModel> UploadAsync(ApiClient client, Guid taskId, byte[] bytes, string fileName, string contentType)
    {
        var response = await client.Http.PostAsync($"/api/tasks/{taskId}/attachments", FileContent(bytes, fileName, contentType));
        response.EnsureSuccessStatusCode();
        return await ApiClient.ReadAsync<AttachmentModel>(response);
    }

    [Fact]
    public async Task Upload_Image_201_IsImageTrue()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        var response = await worker.Http.PostAsync(
            $"/api/tasks/{task.Id}/attachments",
            FileContent(new byte[] { 1, 2, 3, 4 }, "photo.png", "image/png"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var attachment = await ApiClient.ReadAsync<AttachmentModel>(response);
        Assert.True(attachment.IsImage);
        Assert.Equal("photo.png", attachment.FileName);
        Assert.Equal(4, attachment.SizeBytes);
        Assert.Equal(self.Id, attachment.UploadedById);
    }

    [Fact]
    public async Task Upload_NonImage_201_IsImageFalse()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        var attachment = await UploadAsync(worker, task.Id, new byte[] { 9, 9, 9 }, "notes.txt", "text/plain");
        Assert.False(attachment.IsImage);
    }

    [Fact]
    public async Task Upload_NoFile_400()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        // Multipart with an unrelated field, no 'file' part.
        var content = new MultipartFormDataContent { { new StringContent("x"), "other", "x.txt" } };
        var response = await worker.Http.PostAsync($"/api/tasks/{task.Id}/attachments", content);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Upload_Over10MB_400()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        var bytes = new byte[10 * 1024 * 1024 + 1]; // just over the 10 MB limit
        var response = await worker.Http.PostAsync(
            $"/api/tasks/{task.Id}/attachments", FileContent(bytes, "big.bin", "application/octet-stream"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Upload_CrossWorker_404()
    {
        var (_, owner) = await NewWorkerClientAsync("owner");
        var (intruder, _) = await NewWorkerClientAsync("intruder");
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, owner.Id);

        var response = await intruder.Http.PostAsync(
            $"/api/tasks/{task.Id}/attachments", FileContent(new byte[] { 1 }, "x.txt", "text/plain"));
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task List_ReturnsUploaded()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);

        await UploadAsync(worker, task.Id, new byte[] { 1, 2 }, "a.txt", "text/plain");

        var list = await ApiClient.ReadAsync<List<AttachmentModel>>(
            await worker.Http.GetAsync($"/api/tasks/{task.Id}/attachments"));
        Assert.Single(list);
        Assert.Equal("a.txt", list[0].FileName);
    }

    [Fact]
    public async Task Content_Auth_200_ReturnsBytes()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);
        var payload = new byte[] { 10, 20, 30, 40 };
        var attachment = await UploadAsync(worker, task.Id, payload, "data.bin", "application/octet-stream");

        var response = await worker.Http.GetAsync($"/api/tasks/{task.Id}/attachments/{attachment.Id}/content");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal(payload, bytes);
    }

    [Fact]
    public async Task Content_Unauth_401()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);
        var attachment = await UploadAsync(worker, task.Id, new byte[] { 1 }, "x.bin", "application/octet-stream");

        var anon = NewClient();
        var response = await anon.Http.GetAsync($"/api/tasks/{task.Id}/attachments/{attachment.Id}/content");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Delete_Uploader_204()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);
        var attachment = await UploadAsync(worker, task.Id, new byte[] { 1 }, "x.bin", "application/octet-stream");

        var response = await worker.Http.DeleteAsync($"/api/tasks/{task.Id}/attachments/{attachment.Id}");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var list = await ApiClient.ReadAsync<List<AttachmentModel>>(
            await worker.Http.GetAsync($"/api/tasks/{task.Id}/attachments"));
        Assert.Empty(list);
    }

    [Fact]
    public async Task Delete_Admin_204()
    {
        var (worker, self) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, self.Id);
        var attachment = await UploadAsync(worker, task.Id, new byte[] { 1 }, "x.bin", "application/octet-stream");

        var response = await admin.Http.DeleteAsync($"/api/tasks/{task.Id}/attachments/{attachment.Id}");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task Delete_CrossWorker_404()
    {
        var (owner, ownerUser) = await NewWorkerClientAsync("owner");
        var (intruder, _) = await NewWorkerClientAsync("intruder");
        var admin = await AdminClientAsync();
        var task = await CreateTaskAsync(admin, ownerUser.Id);
        var attachment = await UploadAsync(owner, task.Id, new byte[] { 1 }, "x.bin", "application/octet-stream");

        // The intruder is not the assignee, so even the task is invisible -> 404 (existence not leaked).
        var response = await intruder.Http.DeleteAsync($"/api/tasks/{task.Id}/attachments/{attachment.Id}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
