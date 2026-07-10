# PowerShell 静态文件服务器 - 替代 server.js
$port = 5173
$rootDir = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving on port $port (Ctrl+C to stop)" -ForegroundColor Green

$mimes = @{
    '.html'='text/html'; '.js'='text/javascript'; '.css'='text/css'
    '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg'
    '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.mp3'='audio/mpeg'
    '.wav'='audio/wav'; '.woff'='font/woff'; '.woff2'='font/woff2'
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.LocalPath
        if ($path -eq '/') { $path = '/index.html' }
        $path = $path.Split('?')[0]
        $filePath = Join-Path $rootDir ($path -replace '/', [System.IO.Path]::DirectorySeparatorChar)
        
        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath)
            $contentType = $mimes[$ext]
            if (-not $contentType) { $contentType = 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $buffer = [Text.Encoding]::UTF8.GetBytes('Not found')
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
}
