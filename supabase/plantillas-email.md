# Plantillas de email de Supabase

Se pegan en Supabase → Authentication → Emails → Templates, una vez configurado
el SMTP propio (sin SMTP propio Supabase no deja editarlas).

La misma plantilla sirve para las dos: **Magic link or OTP** y **Confirm sign up**.
El usuario puede escribir el código en la app (funciona en cualquier navegador y en
la app instalada) o pulsar el botón.

## Asunto

```
Tu código para entrar: {{ .Token }}
```

## Cuerpo (pestaña "Source" / HTML)

```html
<div style="font-family: Arial, Helvetica, sans-serif; background:#f3f4ef; padding:32px 16px; color:#1c2620;">
  <div style="max-width:440px; margin:0 auto; background:#ffffff; border:1px solid #dadfd6; border-radius:12px; padding:32px 28px;">
    <h1 style="margin:0 0 8px; font-size:22px;">Tu código para entrar</h1>
    <p style="margin:0 0 24px; color:#56605a; font-size:15px; line-height:1.5;">
      Escríbelo en la pantalla de entrada. Caduca en una hora.
    </p>
    <p style="margin:0 0 28px; font-size:34px; font-weight:bold; letter-spacing:8px; text-align:center; color:#1f4d3a;">
      {{ .Token }}
    </p>
    <p style="margin:0 0 12px; color:#56605a; font-size:14px; line-height:1.5;">
      O entra directamente con este botón:
    </p>
    <p style="margin:0 0 28px;">
      <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email"
         style="display:inline-block; background:#1f4d3a; color:#ffffff; text-decoration:none; font-weight:bold; padding:12px 20px; border-radius:8px;">
        Entrar
      </a>
    </p>
    <p style="margin:0; color:#56605a; font-size:13px; line-height:1.5;">
      Si no has pedido este código, ignora este email. Nadie puede entrar sin él.
    </p>
  </div>
</div>
```

Nota: el botón usa `{{ .RedirectTo }}`, que la app rellena con
`https://<tu-web>/auth/confirm?next=...`. Para que funcione, esa dirección tiene que
estar en Authentication → URL Configuration → Redirect URLs.
