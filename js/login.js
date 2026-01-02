// js/login.js

// 1. Verifica se já está logado ao abrir a página
if (localStorage.getItem('usuario')) {
    window.location.href = 'produtividade.html';
}

// 2. Adiciona evento para tecla "Enter" nos inputs
document.getElementById('login-id').addEventListener('keypress', handleEnter);
document.getElementById('senha').addEventListener('keypress', handleEnter);

function handleEnter(e) {
    if (e.key === 'Enter') fazerLogin();
}

// 3. Função Principal de Login
async function fazerLogin() {
    // Pega os elementos da tela
    const idInput = document.getElementById('login-id');
    const passInput = document.getElementById('senha');
    const btn = document.getElementById('btn-entrar');
    const msg = document.getElementById('error-msg');

    const idVal = idInput.value.trim();
    const passVal = passInput.value.trim();

    // Reseta estado visual
    msg.classList.add('hidden'); // Esconde erro
    idInput.classList.remove('border-red-500'); // Remove borda vermelha
    
    // Validação básica
    if (!idVal || !passVal) {
        msg.innerText = "Por favor, preencha ID e Senha.";
        msg.classList.remove('hidden');
        return;
    }

    // Feedback de carregamento
    const textoOriginal = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Verificando...";
    btn.classList.add('opacity-70', 'cursor-not-allowed');

    try {
        // Consulta ao Supabase (usando a variável _supabase do config.js)
        if (!_supabase) throw new Error("Erro de conexão com o banco.");

        const { data, error } = await _supabase
            .from('usuarios')
            .select('*')
            .eq('id', idVal)
            .eq('senha', passVal)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            // Sucesso: Salva sessão e redireciona
            localStorage.setItem('usuario', JSON.stringify(data));
            // Como ainda não migramos a produtividade.html, isso pode dar 404 se testar agora, 
            // mas é o comportamento correto.
            window.location.href = 'produtividade.html'; 
        } else {
            throw new Error("Usuário não encontrado");
        }

    } catch (err) {
        console.error(err);
        msg.innerText = "ID ou Senha incorretos.";
        msg.classList.remove('hidden');
        idInput.classList.add('border-red-500'); // Destaca erro no input
    } finally {
        // Restaura o botão
        btn.disabled = false;
        btn.innerText = textoOriginal;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}