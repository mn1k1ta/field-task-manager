using System.Net.Http.Json;

namespace FieldTaskManager.Tests.Integration;

/// <summary>
/// Base for HTTP integration tests. Each test CLASS gets its OWN factory + isolated SQLite DB
/// (created in the constructor, disposed at the end), so classes never share state. Helpers create
/// admin/worker clients and tasks; usernames are made unique per call to keep tests independent.
/// </summary>
public abstract class IntegrationTestBase : IDisposable
{
    protected readonly CustomWebApplicationFactory Factory = new();

    /// <summary>A fresh, unauthenticated client.</summary>
    protected ApiClient NewClient() => new(Factory.CreateClient());

    /// <summary>A client authenticated as the seeded admin.</summary>
    protected async Task<ApiClient> AdminClientAsync()
    {
        var client = NewClient();
        await client.LoginAsync(CustomWebApplicationFactory.SeedAdminUsername, CustomWebApplicationFactory.SeedAdminPassword);
        return client;
    }

    /// <summary>Registers a brand-new Worker (unique username) and returns a logged-in client + the user.</summary>
    protected async Task<(ApiClient Client, UserModel User)> NewWorkerClientAsync(string? prefix = null)
    {
        var username = $"{prefix ?? "worker"}-{Guid.NewGuid():N}";
        const string password = "Passw0rd!";

        var anon = NewClient();
        var register = await anon.PostJsonAsync("/api/auth/register", new { username, password, displayName = username });
        register.EnsureSuccessStatusCode();

        var client = NewClient();
        var auth = await client.LoginAsync(username, password);
        return (client, auth.User);
    }

    /// <summary>Creates a task as admin assigned to the given worker; returns the created TaskModel.</summary>
    protected async Task<TaskModel> CreateTaskAsync(
        ApiClient admin,
        Guid assigneeId,
        string title = "Inspect site",
        int? priority = null,
        string[]? labels = null,
        string? icon = null,
        double[][]? area = null,
        string? description = null)
    {
        var response = await admin.PostJsonAsync("/api/tasks", new
        {
            title,
            description,
            icon,
            priority,
            labels,
            latitude = 50.45,
            longitude = 30.52,
            area,
            assigneeId,
            deadline = DateTime.UtcNow.AddDays(2)
        });
        response.EnsureSuccessStatusCode();
        return await ApiClient.ReadAsync<TaskModel>(response);
    }

    public void Dispose() => Factory.Dispose();
}
