{{- define "elahe-messenger.name" -}}
elahe-messenger
{{- end -}}

{{- define "elahe-messenger.fullname" -}}
{{ include "elahe-messenger.name" . }}
{{- end -}}
