-- Bind report permissions to standard system roles when they exist.

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM public.roles
JOIN public.permissions ON permissions.name = 'visualizar_relatorios'
WHERE LOWER(roles.name) IN ('admin', 'gerente', 'visualizador')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM public.roles
JOIN public.permissions ON permissions.name = 'gerenciar_relatorios'
WHERE LOWER(roles.name) = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;
