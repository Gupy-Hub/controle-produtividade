// Aguarda o carregamento do DOM para adicionar os eventos
document.addEventListener('DOMContentLoaded', () => {
    
    // Adicionar evento de "Enter" nos campos de input para facilitar o login
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                fazerLogin();
            }
        });
    });

    // Foco automático no campo de ID ao carregar
    const idInput = document.getElementById('login-id');
    if(idInput) idInput.focus();
});

async function fazerLogin() {
    const idInput = document.getElementById('login-id');
    const passInput = document.getElementById('login-pass');
    const btn = document.querySelector('button');
    
    // Resetar estilos de erro
    idInput.classList.remove('border-red-500');
    passInput.classList.remove('border-red-500');

    const idVal = idInput.value.trim();
    const passVal = passInput.value.trim();

    // Validação básica
    if (!idVal || !passVal) {
        alert("Por favor, preencha o ID e a Senha.");
        if(!idVal) idInput.classList.add('border-red-500');
        if(!passVal) passInput.classList.add('border-red-500');
        return;
    }

    // Feedback visual no botão
    const originalText = btn.innerText;
    btn.innerText = "Entrando...";
    btn.disabled = true;
    btn.classList.add('opacity-70', 'cursor-not-allowed');

    try {
        // Verifica conexão
        if (typeof _supabase === 'undefined' || !_supabase) {
            throw new Error("Erro de conexão com o banco de dados. Verifique o config.js.");
        }

        // Consulta ao Supabase
        const { data, error } = await _supabase
            .from('usuarios')
            .select('*')
            .eq('id', idVal)
            .eq('senha', passVal)
            .eq('ativo', true) // <-- SEGURANÇA: Só permite login se estiver ativo
            .maybeSingle();

        if (error) throw error;

        if (data) {
            // SUCESSO
            console.log("Login realizado com sucesso:", data.nome);
            
            // Salvar sessão no navegador
            localStorage.setItem('usuario', JSON.stringify(data));
            
            // Redirecionamento baseado na função (Opcional: podes direcionar gestores para outra pág)
            // Por padrão, todos vão para produtividade
            window.location.href = 'produtividade.html'; 
        } else {
            // FALHA (Usuário não encontrado, senha errada ou inativo)
            throw new Error("ID ou Senha incorretos, ou conta inativa.");
        }

    } catch (err) {
        console.error("Erro no login:", err);
        alert(err.message);
        
        // Se for erro de credenciais, destaca os campos
        if (err.message.includes("incorretos") || err.message.includes("inativa")) {
            idInput.classList.add('border-red-500');
            passInput.classList.add('border-red-500');
            passInput.value = ''; // Limpa a senha
            passInput.focus();
        }
    } finally {
        // Restaura o botão
        btn.innerText = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}