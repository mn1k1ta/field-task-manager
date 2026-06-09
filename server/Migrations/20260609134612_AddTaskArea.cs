using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FieldTaskManager.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskArea : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Area",
                table: "FieldTasks",
                type: "TEXT",
                maxLength: 4000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Area",
                table: "FieldTasks");
        }
    }
}
