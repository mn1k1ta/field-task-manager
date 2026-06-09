using System.ComponentModel.DataAnnotations;

namespace FieldTaskManager.Api.Contracts.Tasks;

public record UpdateAssigneeRequest(
    [Required]
    Guid AssigneeId
);
