const fs = require('fs');
const path = require('path');

const dir = 'app/components/admin';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx') && f !== 'AdminShell.jsx' && f !== 'AdminFooter.jsx' && f !== 'Dashboard.jsx');

for (const file of files) {
    const p = path.join(dir, file);
    let code = fs.readFileSync(p, 'utf8');

    // Make sure React's useState is imported if needed, but it should already be.
    // Ensure we have a busy state if the file has a modal.
    if (code.includes('modal') && !code.includes('const [busy')) {
        code = code.replace(/const \[modal, setModal\] = useState\(null\);/g, 'const [modal, setModal] = useState(null);\n  const [busy, setBusy] = useState(false);');
    }

    // Replace send(...) with setBusy/await
    // This is tricky because we don't want to break the syntax.
    code = code.replace(/(?<!await )send\([^)]+\);/g, 'setBusy(true); await $& setBusy(false);');
    
    // Ensure the function calling send is async
    code = code.replace(/const (confirmAction) = \(\) => \{/g, 'const $1 = async () => {');
    
    // Disable buttons
    code = code.replace(/>\{modal\.confirmText\}<\/button>/g, ' disabled={busy}>{busy ? \'Memproses...\' : modal.confirmText}</button>');
    
    fs.writeFileSync(p, code);
}
