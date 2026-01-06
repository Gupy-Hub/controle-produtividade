// js/login.js

async function fazerLogin() {
    const idInput = document.getElementById('login-id');
    const senhaInput = document.getElementById('login-senha');
    const btn = document.getElementById('btn-login');

    const id = idInput.value.trim();
    const senha = senhaInput.value.trim();

    if (!id || !senha) {
        alert("Por favor, preencha o ID e a Senha.");
        return;
    }

    // Feedback visual de carregamento
    const textoOriginal = btn.innerText;
    btn.innerText = "Verificando...";
    btn.disabled = true;
    btn.classList.add('opacity-70', 'cursor-not-allowed');

    try {
        // 1. Verifica se as credenciais globais existem
        if (!window.SUPABASE_URL || !window.SUPABASE_KEY) {
            throw new Error("Erro de configuração: Credenciais do Supabase não encontradas no config.js");
        }

        // 2. Inicializa o cliente Supabase
        // (Mesmo que já tenha sido inicializado em outros lugares, aqui garantimos localmente para o login)
        const _supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

        // 3. Consulta o banco de dados
        const { data, error } = await _supabase
            .from('usuarios')
            .select('*')
            .eq('id', parseInt(id))
            .single();

        if (error) {
            // Se o erro for "PGRST116", significa que não encontrou linhas (ID incorreto)
            if (error.code === 'PGRST116') {
                throw new Error("Usuário não encontrado.");
            }
            throw error; // Outros erros de conexão
        }

        // 4. Verifica a senha (Comparação simples conforme seu sistema atual)
        if (data && String(data.senha) === senha) {
            // Sucesso! Salva na sessão
            const usuarioSessao = {
                id: data.id,
                nome: data.nome,
                funcao: data.funcao, // 'Assistente', 'Gestora', etc.
                contrato: data.contrato
            };

            localStorage.setItem('usuario', JSON.stringify(usuarioSessao));

            // Redirecionamento baseado na função (Opcional, ou vai direto para produtividade)
            // Por padrão, vamos para a tela principal
            window.location.href = 'produtividade.html'; 
        } else {
            throw new Error("Senha incorreta.");
        }

    } catch (err) {
        console.error("Erro no login:", err);
        alert(err.message || "Erro ao conectar ao servidor.");
        
        // Restaura o botão
        btn.innerText = textoOriginal;
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}