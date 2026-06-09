using System.Net;
using System.Net.Http.Json;

namespace FieldTaskManager.Tests.Integration;

/// <summary>
/// HTTP-level auth: unauthenticated rejection (401), admin login + GET me, self-register as Worker
/// (201), duplicate (409), short password (400), bad credentials (401), and the users endpoint gate.
/// </summary>
public class AuthEndpointsTests : IntegrationTestBase
{
    [Fact]
    public async Task ListTasks_WithoutToken_Returns401()
    {
        var anon = NewClient();
        var response = await anon.Http.GetAsync("/api/tasks");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_WithoutToken_Returns401()
    {
        var anon = NewClient();
        var response = await anon.Http.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_WithTamperedToken_Returns401()
    {
        var anon = NewClient();
        anon.SetToken("not-a-real-jwt");
        var response = await anon.Http.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AdminLogin_ReturnsToken_AndMeReportsAdmin()
    {
        var admin = await AdminClientAsync();
        var response = await admin.Http.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var me = await ApiClient.ReadAsync<UserModel>(response);
        Assert.Equal(CustomWebApplicationFactory.SeedAdminUsername, me.Username);
        Assert.Equal(Wire.RoleAdmin, me.Role);
    }

    [Fact]
    public async Task Register_CreatesWorker_201()
    {
        var anon = NewClient();
        var username = $"reg-{Guid.NewGuid():N}";
        var response = await anon.PostJsonAsync("/api/auth/register",
            new { username, password = "Passw0rd!", displayName = "New Worker", role = 0 /* attempt to escalate; must be ignored */ });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var user = await ApiClient.ReadAsync<UserModel>(response);
        Assert.Equal(Wire.RoleWorker, user.Role); // never Admin, even though role=0 was posted
        Assert.Equal(username, user.Username);
    }

    [Fact]
    public async Task Register_DuplicateUsername_409()
    {
        var anon = NewClient();
        var username = $"dup-{Guid.NewGuid():N}";
        var first = await anon.PostJsonAsync("/api/auth/register", new { username, password = "Passw0rd!" });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await anon.PostJsonAsync("/api/auth/register", new { username, password = "Different1!" });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Register_ShortPassword_400()
    {
        var anon = NewClient();
        var response = await anon.PostJsonAsync("/api/auth/register",
            new { username = $"short-{Guid.NewGuid():N}", password = "12345" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_ThenLogin_Succeeds()
    {
        var (client, user) = await NewWorkerClientAsync();
        var response = await client.Http.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = await ApiClient.ReadAsync<UserModel>(response);
        Assert.Equal(user.Id, me.Id);
    }

    [Fact]
    public async Task Login_BadCredentials_401()
    {
        var anon = NewClient();
        var response = await anon.Http.PostAsJsonAsync("/api/auth/login",
            new { username = CustomWebApplicationFactory.SeedAdminUsername, password = "wrong-password" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetUsers_Admin_200_FiltersWorkers()
    {
        var (_, worker) = await NewWorkerClientAsync();
        var admin = await AdminClientAsync();

        var response = await admin.Http.GetAsync("/api/users?role=1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var users = await ApiClient.ReadAsync<List<UserModel>>(response);
        Assert.Contains(users, u => u.Id == worker.Id);
        Assert.All(users, u => Assert.Equal(Wire.RoleWorker, u.Role));
    }

    [Fact]
    public async Task GetUsers_Worker_403()
    {
        var (worker, _) = await NewWorkerClientAsync();
        var response = await worker.Http.GetAsync("/api/users");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
