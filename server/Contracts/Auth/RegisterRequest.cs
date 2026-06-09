using System.ComponentModel.DataAnnotations;

namespace FieldTaskManager.Api.Contracts.Auth;

public record RegisterRequest(
    [Required]
    [StringLength(256, MinimumLength = 1)]
    string Username,

    [Required]
    [MinLength(6)]
    string Password,

    [StringLength(256)]
    string? DisplayName
);
