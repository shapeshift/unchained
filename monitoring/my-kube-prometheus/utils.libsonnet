{
  addArgs(args, name, containers): std.map(
    function(c)
      if c.name == name then
        c {
          args+: args,
        }
      else c,
    containers,
  ),
}