// Одноразовая функция переноса лидов формы 1654068123116460 во вкладку «Вакансии Facebook» отработала 12.11.2026.
// Оставлена заглушка без доступа к данным; функцию можно удалить: Supabase Dashboard → Edge Functions → meta-lead-reroute.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "Gone: one-off function already ran on 2026-11-12" }), {
    status: 410,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
);
