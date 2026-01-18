window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Usuarios = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Feedback Visual no Botão
        const parentDiv = input.closest('div'); 
        const btnImportar = parentDiv ? parentDiv.querySelector('button') : null; // Pega o botão "Importar"
        let originalText = '';
        
        if (btnImportar) {
            originalText = btnImportar.innerHTML;
            btnImportar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';
            btnImportar.disabled = true;
            btnImportar.classList.add('opacity-75', 'cursor-not-allowed');
        }

        try {
            // Usa o PapaParse diretamente para ler o CSV
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: "UTF-8",
                complete: async (results) => {
                    await this.processarDados(results.data);
                    
                    // Reset UI
                    input.value = ""; 
                    if (btnImportar) {
                        btnImportar.innerHTML = originalText;
                        btnImportar.disabled = false;
                        btnImportar.classList.remove('opacity-75', 'cursor-not-allowed');
                    }
                },
                error: (error) => {
                    console.error(error);
                    alert("Erro ao ler CSV: " + error.message);
                }
            });

        } catch (e) {
            console.error(e);
            alert("Erro crítico: " + e.message);
        }
    },

    processarDados: async function(linhas) {
        console.log(`📊 Processando ${linhas.length} usuários...`);
        const listaUpsert = [];
        
        // Hash padrão para senha inicial (ex: gupy123)
        // Como o login é por ID, definimos uma senha padrão para todos inicialmente
        const senhaPadraoHash = "gupy123"; 

        for (const row of linhas) {
            // Mapeamento das colunas do CSV
            // CSV Header: ID ASSISTENTE, NOME ASSIST, CONTRATO, SITUAÇÃO
            
            // Tratamento de chaves (remove espaços e poe minusculo para garantir)
            const getVal = (key) => {
                const val = row[key] || row[key.toUpperCase()] || '';
                return val.toString().trim();
            };

            const idRaw = getVal('ID ASSISTENTE');
            const nomeRaw = getVal('NOME ASSIST');
            const contratoRaw = getVal('CONTRATO').toUpperCase();
            const situacaoRaw = getVal('SITUAÇÃO').toUpperCase();

            if (!idRaw || !nomeRaw) continue; // Pula vazios

            const id = parseInt(idRaw); // ID do CSV vira o ID do Banco
            const ativo = situacaoRaw === 'ATIVO';
            
            // Definição de Função baseada no Contrato/Nome
            let funcao = 'ASSISTENTE';
            if (contratoRaw.includes('AUDITORA')) funcao = 'AUDITORA';
            if (contratoRaw.includes('GESTORA')) funcao = 'GESTORA';

            listaUpsert.push({
                id: id,
                nome: nomeRaw,
                contrato: contratoRaw,
                funcao: funcao,
                ativo: ativo,
                senha: senhaPadraoHash
            });
        }

        if (listaUpsert.length > 0) {
            // Envio em lotes para não travar
            const { error } = await Sistema.supabase
                .from('usuarios')
                .upsert(listaUpsert, { onConflict: 'id' }); // Atualiza se ID já existir

            if (error) {
                console.error("Erro Supabase:", error);
                alert("Erro ao salvar no banco: " + error.message);
            } else {
                alert(`✅ Sucesso! ${listaUpsert.length} usuários importados/atualizados.`);
                if (Gestao.Usuarios) Gestao.Usuarios.carregar(); // Atualiza a tela
            }
        } else {
            alert("Nenhum dado válido encontrado nas colunas esperadas (ID ASSISTENTE, NOME ASSIST).");
        }
    }
};