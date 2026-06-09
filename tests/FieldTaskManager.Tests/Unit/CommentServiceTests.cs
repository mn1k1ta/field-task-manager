using FieldTaskManager.Api.Common;
using FieldTaskManager.Api.Contracts.Comments;
using FieldTaskManager.Api.Data;
using FieldTaskManager.Api.Domain.Entities;
using FieldTaskManager.Api.Domain.Enums;
using FieldTaskManager.Api.Services;

namespace FieldTaskManager.Tests.Unit;

/// <summary>
/// CommentService against a real in-memory DbContext: add (ownership + empty body rejected),
/// list oldest-to-newest with ownership (Worker non-owner -> NotFound).
/// </summary>
public class CommentServiceTests : IDisposable
{
    private readonly TestDb _db = new();
    private readonly User _admin;
    private readonly User _worker;
    private readonly User _otherWorker;

    public CommentServiceTests()
    {
        _admin = _db.SeedUser(Role.Admin, "admin");
        _worker = _db.SeedUser(Role.Worker, "worker");
        _otherWorker = _db.SeedUser(Role.Worker, "worker2");
    }

    private static CommentService NewService(AppDbContext ctx) => new(ctx);

    [Fact]
    public async Task Add_Owner_PersistsWithAuthorAndTimestamp()
    {
        var task = _db.SeedTask(_worker.Id);
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).AddAsync(
            task.Id, new CreateCommentRequest("  done by noon  "), CurrentUsers.For(_worker));

        Assert.Equal("done by noon", dto.Body); // trimmed
        Assert.Equal(_worker.Id, dto.AuthorId);
        Assert.Equal(_worker.DisplayName, dto.AuthorName);
        Assert.Equal(task.Id, dto.TaskId);
        Assert.NotEqual(default, dto.CreatedAtUtc);
    }

    [Fact]
    public async Task Add_Admin_CanCommentOnAnyTask()
    {
        var task = _db.SeedTask(_worker.Id);
        using var ctx = _db.NewContext();
        var dto = await NewService(ctx).AddAsync(
            task.Id, new CreateCommentRequest("admin note"), CurrentUsers.For(_admin));
        Assert.Equal(_admin.Id, dto.AuthorId);
    }

    [Fact]
    public async Task Add_EmptyBody_ThrowsValidation()
    {
        var task = _db.SeedTask(_worker.Id);
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<ValidationException>(() =>
            NewService(ctx).AddAsync(task.Id, new CreateCommentRequest("   "), CurrentUsers.For(_worker)));
    }

    [Fact]
    public async Task Add_Worker_NonOwner_ThrowsNotFound()
    {
        var task = _db.SeedTask(_otherWorker.Id);
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewService(ctx).AddAsync(task.Id, new CreateCommentRequest("hi"), CurrentUsers.For(_worker)));
    }

    [Fact]
    public async Task Add_MissingTask_ThrowsNotFound()
    {
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewService(ctx).AddAsync(Guid.NewGuid(), new CreateCommentRequest("hi"), CurrentUsers.For(_admin)));
    }

    [Fact]
    public async Task List_ReturnsOldestToNewest()
    {
        var task = _db.SeedTask(_worker.Id);
        using (var ctx = _db.NewContext())
        {
            var svc = NewService(ctx);
            await svc.AddAsync(task.Id, new CreateCommentRequest("first"), CurrentUsers.For(_worker));
            await Task.Delay(5);
            await svc.AddAsync(task.Id, new CreateCommentRequest("second"), CurrentUsers.For(_worker));
            await Task.Delay(5);
            await svc.AddAsync(task.Id, new CreateCommentRequest("third"), CurrentUsers.For(_admin));
        }

        using var read = _db.NewContext();
        var list = await NewService(read).ListAsync(task.Id, CurrentUsers.For(_worker));

        Assert.Equal(new[] { "first", "second", "third" }, list.Select(c => c.Body).ToArray());
    }

    [Fact]
    public async Task List_Worker_NonOwner_ThrowsNotFound()
    {
        var task = _db.SeedTask(_otherWorker.Id);
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewService(ctx).ListAsync(task.Id, CurrentUsers.For(_worker)));
    }

    [Fact]
    public async Task List_MissingTask_ThrowsNotFound()
    {
        using var ctx = _db.NewContext();
        await Assert.ThrowsAsync<NotFoundException>(() =>
            NewService(ctx).ListAsync(Guid.NewGuid(), CurrentUsers.For(_admin)));
    }

    public void Dispose() => _db.Dispose();
}
