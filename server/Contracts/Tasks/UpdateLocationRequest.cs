using System.ComponentModel.DataAnnotations;

namespace FieldTaskManager.Api.Contracts.Tasks;

public record UpdateLocationRequest(
    [Range(-90.0, 90.0)]
    double Latitude,

    [Range(-180.0, 180.0)]
    double Longitude
);
