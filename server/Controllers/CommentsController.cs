using FieldTaskManager.Api.Contracts.Comments;
using FieldTaskManager.Api.Security;
using FieldTaskManager.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FieldTaskManager.Api.Controllers;

[ApiController]
[Route("api/tasks/{taskId:guid}/comments")]
[Authorize]
public class CommentsController : ControllerBase
{
    private readonly ICommentService _commentService;
    private readonly ICurrentUserAccessor _currentUser;

    public CommentsController(ICommentService commentService, ICurrentUserAccessor currentUser)
    {
        _commentService = commentService;
        _currentUser = currentUser;
    }

    /// <summary>List a task's comments oldest-to-newest. Worker only own task (else 404).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CommentDto>>> List(Guid taskId, CancellationToken ct)
    {
        var comments = await _commentService.ListAsync(taskId, _currentUser.Current, ct);
        return Ok(comments);
    }

    /// <summary>Add a comment. Worker only own task (else 404).</summary>
    [HttpPost]
    public async Task<ActionResult<CommentDto>> Add(Guid taskId, CreateCommentRequest request, CancellationToken ct)
    {
        var comment = await _commentService.AddAsync(taskId, request, _currentUser.Current, ct);
        return StatusCode(StatusCodes.Status201Created, comment);
    }
}
