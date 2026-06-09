using System.ComponentModel.DataAnnotations;

namespace FieldTaskManager.Api.Contracts.Auth;

public record LoginRequest(
    [Required]
    string Username,

    [Required]
    string Password
);
