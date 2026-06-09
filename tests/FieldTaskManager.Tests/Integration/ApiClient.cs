using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace FieldTaskManager.Tests.Integration;

/// <summary>
/// Thin helper over an <see cref="HttpClient"/> for the integration tests. Drives the real HTTP API
/// end-to-end: logs in to obtain a JWT, attaches the bearer token, and (de)serializes JSON with the
/// server's wire conventions (camelCase, enums as integers).
/// </summary>
public sealed class ApiClient
{
    public HttpClient Http { get; }

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public ApiClient(HttpClient http) => Http = http;

    public void SetToken(string? token)
    {
        Http.DefaultRequestHeaders.Authorization = token is null
            ? null
            : new AuthenticationHeaderValue("Bearer", token);
    }

    /// <summary>Logs in and sets the bearer token on this client; returns the auth response.</summary>
    public async Task<AuthResponseModel> LoginAsync(string username, string password)
    {
        var response = await Http.PostAsJsonAsync("/api/auth/login", new { username, password });
        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<AuthResponseModel>(Json);
        SetToken(auth!.Token);
        return auth;
    }

    public Task<HttpResponseMessage> PostJsonAsync(string url, object body) =>
        Http.PostAsJsonAsync(url, body, Json);

    public Task<HttpResponseMessage> PutJsonAsync(string url, object body) =>
        Http.PutAsJsonAsync(url, body, Json);

    public Task<HttpResponseMessage> PatchJsonAsync(string url, object body) =>
        Http.PatchAsJsonAsync(url, body, Json);

    public static async Task<T> ReadAsync<T>(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(Json))!;
}

// ----- Wire models mirroring the server DTOs (enums as integers) -----

public record UserModel(Guid Id, string Username, string DisplayName, int Role);

public record AuthResponseModel(string Token, UserModel User);

public record TaskModel(
    Guid Id,
    string Title,
    string? Description,
    string Icon,
    int Priority,
    string[] Labels,
    double Latitude,
    double Longitude,
    double[][]? Area,
    Guid AssigneeId,
    string AssigneeName,
    DateTime Deadline,
    int Status,
    int AttachmentCount,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

public record CommentModel(
    Guid Id,
    Guid TaskId,
    Guid AuthorId,
    string AuthorName,
    string Body,
    DateTime CreatedAtUtc);

public record AttachmentModel(
    Guid Id,
    Guid TaskId,
    string FileName,
    string ContentType,
    long SizeBytes,
    bool IsImage,
    Guid UploadedById,
    string UploadedByName,
    DateTime UploadedAtUtc,
    string Url);

/// <summary>Wire enum integer values, mirrored from the server enums for readable assertions.</summary>
public static class Wire
{
    public const int RoleAdmin = 0;
    public const int RoleWorker = 1;

    public const int StatusCreated = 0;
    public const int StatusInProgress = 1;
    public const int StatusDone = 2;
    public const int StatusVerified = 3;

    public const int PriorityLow = 0;
    public const int PriorityMedium = 1;
    public const int PriorityHigh = 2;
    public const int PriorityUrgent = 3;
}
