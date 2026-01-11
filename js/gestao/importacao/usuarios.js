window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Usuarios = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Feedback Visual (Pega o elemento pai do input, que é o botão)
        const btnLabel = input.parentElement;
        const originalHtml = btnLabel.innerHTML;
        btnLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';
        btnLabel.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            // Usa o helper global de leitura (definido em main.js)
            const linhas = await Gestao.lerArquivo(file);
            
            const mapUsuarios = new Map();
            const hashPadrao = await Sistema.gerarHash('gupy123');

            for (const row of linhas) {
                // Normaliza chaves para evitar erros de digitação no cabeçalho
                const c = {};
                Object.keys(row).forEach(k => c[this.normalizarChave(k)] = row[k]);

                // 1. Validação de Campos Obrigatórios
                const id = parseInt(c['idassistente'] || c['id'] || 0);
                const nome = c['nomeassist'] || c['nome'] || '';
                
                if (!id || !nome) continue; // Pula linha inválida

                // 2. Normalização de Dados (Regras de Negócio)
                const situacaoRaw = (c['situacao'] || c['status'] || 'ATIVO').toUpperCase().trim();
                const contrato = (c['contrato'] || 'CLT').toUpperCase().trim();
                
                // Regra: Contrato FINALIZADO força status INATIVO
                let ativo = situacaoRaw === 'ATIVO';
                if (contrato === 'FINALIZADO') ativo = false;

                // Regra: Definição de Permissão baseada no Contrato
                let funcao = 'ASSISTENTE';
                if (contrato.includes('AUDITORA')) funcao = 'AUDITORA';
                if (contrato.includes('GESTORA')) funcao = 'GESTORA';

                // 3. Prepara Objeto (Map garante unicidade pelo ID)
                mapUsuarios.set(id, {
                    id: id,
                    nome: String(nome).trim(),
                    contrato: contrato,
                    ativo: ativo,
                    funcao: funcao,
                    perfil: (funcao === 'GESTORA' ? 'admin' : 'user'),
                    senha: hashPadrao // Senha padrão
                });
            }

            // 4. Envio ao Banco
            const upserts = Array.from(mapUsuarios.values());

            if (upserts.length > 0) {
                const { error } = await Sistema.supabase.from('usuarios').upsert(upserts);
                if (error) throw error;
                
                alert(`Importação concluída com sucesso!\n${upserts.length} usuários processados.`);
                
                // Atualiza a tela de listagem se ela estiver carregada
                if (Gestao.Usuarios && typeof Gestao.Usuarios.carregar === 'function') {
                    Gestao.Usuarios.carregar();
                }
            } else {
                alert("Nenhum dado válido encontrado. Verifique se a planilha possui as colunas 'ID ASSISTENTE' e 'NOME ASSIST'.");
            }

        } catch (e) {
            console.error(e);
            alert("Erro crítico na importação: " + e.message);
        } finally {
            // Restaura o botão original (resetando o input file)
            btnLabel.innerHTML = originalHtml;
            btnLabel.classList.remove('opacity-50', 'cursor-not-allowed');
            input.value = ""; // Permite selecionar o mesmo arquivo novamente se falhar
        }
    },

    normalizarChave: function(k) {
        return k.trim().toLowerCase().replace(/_/g, '').replace(/ /g, '');
    }
};