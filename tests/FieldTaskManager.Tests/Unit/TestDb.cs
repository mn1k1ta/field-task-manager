using FieldTaskManager.Api.Data;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Security;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace FieldTaskManager.Tests.Unit;

/// <summary>
/// A disposable harness that gives each unit test a real <see cref="AppDbContext"/> backed by an
/// OPEN in-memory SQLite connection. The connection is kept open for the lifetime of the harness so
/// the schema (created via <c>EnsureCreated()</c>) survives across the multiple DbContexts a test may
/// open. Closing the connection drops the database, isolating tests from one another.
/// </summary>
public sealed class TestDb : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<AppDbContext> _options;

    public TestDb()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        _options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        using var ctx = new AppDbContext(_options);
        ctx.Database.EnsureCreated();
    }

    /// <summary>Creates a fresh DbContext over the same shared in-memory database.</summary>
    public AppDbContext NewContext() => new(_options);

    /// <summary>Inserts a user directly (bypassing services) and returns it.</summary>
    public User SeedUser(Role role, string username, string? displayName = null, string password = "Passw0rd!")
    {
        using var ctx = NewContext();
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            DisplayName = string.IsNullOrWhiteSpace(displayName) ? username : displayName!,
            Role = role,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            CreatedAtUtc = DateTime.UtcNow
        };
        ctx.Users.Add(user);
        ctx.SaveChanges();
        return user;
    }

    /// <summary>Inserts a task directly with the given status/assignee and returns it.</summary>
    public FieldTask SeedTask(
        Guid assigneeId,
        FieldTaskStatus status = FieldTaskStatus.Created,
        string title = "Task",
        DateTime? deadline = null)
    {
        using var ctx = NewContext();
        var now = DateTime.UtcNow;
        var task = new FieldTask
        {
            Id = Guid.NewGuid(),
            Title = title,
            AssigneeId = assigneeId,
            Status = status,
            Latitude = 50.0,
            Longitude = 30.0,
            Deadline = deadline ?? now.AddDays(1),
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        ctx.FieldTasks.Add(task);
        ctx.SaveChanges();
        return task;
    }

    public void Dispose() => _connection.Dispose();
}

/// <summary>Convenience builders for the <see cref="CurrentUser"/> value object passed to services.</summary>
public static class CurrentUsers
{
    public static CurrentUser For(User user) => new(user.Id, user.Role, user.DisplayName);

    public static CurrentUser Admin(Guid id, string name = "Administrator") => new(id, Role.Admin, name);

    public static CurrentUser Worker(Guid id, string name = "Worker") => new(id, Role.Worker, name);
}
