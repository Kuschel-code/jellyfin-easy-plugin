using System.Linq;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.EasyPlugin.Api;

/// <summary>
/// Serves the client script (injected into <c>index.html</c>) and the current configuration.
/// Both endpoints are anonymous: a <c>&lt;script src&gt;</c> tag carries no auth token, and only
/// the non-sensitive hidden/order/added name lists are exposed.
/// </summary>
[ApiController]
[Route("EasyPlugin")]
public class EasyPluginController : ControllerBase
{
    /// <summary>Serves the embedded client script.</summary>
    /// <returns>The JavaScript file, or 404 if the resource is missing.</returns>
    [HttpGet("ClientScript")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    public ActionResult GetClientScript()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var stream = assembly.GetManifestResourceStream("Jellyfin.Plugin.EasyPlugin.Web.client.js");
        if (stream is null)
        {
            return NotFound();
        }

        return File(stream, "application/javascript");
    }

    /// <summary>Returns the current configuration for the client script.</summary>
    /// <returns>The enabled flag, the hidden/order name lists, and the force-added pages.</returns>
    [HttpGet("Config")]
    [AllowAnonymous]
    [Produces("application/json")]
    public ActionResult GetConfig()
    {
        var c = Plugin.Instance!.Configuration;
        return new JsonResult(new
        {
            enabled = c.Enabled,
            hidden = c.Hidden,
            order = c.Order,
            added = c.Added.Select(a => new { name = a.Name, display = a.DisplayName }),
            groups = c.Groups.Select(g => new { id = g.Id, name = g.Name, members = g.Members })
        });
    }
}
