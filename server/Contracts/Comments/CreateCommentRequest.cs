using System.ComponentModel.DataAnnotations;

namespace FieldTaskManager.Api.Contracts.Comments;

public record CreateCommentRequest(
    [Required]
    [StringLength(2000, MinimumLength = 1)]
    string Body
);
