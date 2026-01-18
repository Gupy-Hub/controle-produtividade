window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Usuarios = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Feedback Visual no Botão
        const parentDiv = input.closest('div'); 
        const btnImportar = parentDiv ? parentDiv.querySelector('button') : null;
        let originalText = '';
        
        if (btnImportar) {
            originalText = btnImportar.innerHTML;
            btnImportar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';
            btnImportar.disabled = true;
            btnImportar.classList.add('opacity-75', 'cursor-not-allowed');
        }

        try {
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
        console.log(`📊 Linhas brutas encontradas: ${linhas.length}`);
        
        // --- DEDUPLICAÇÃO (A Mágica acontece aqui) ---
        // Usamos um Map onde a Chave é o ID. 
        // Se o ID aparecer de novo, o Map sobrescreve, garantindo unicidade.
        const mapUsuarios = new Map();
        const senhaPadraoHash = "gupy123"; 

        for (const row of linhas) {
            // Tratamento de chaves (flexibilidade para cabeçalhos)
            const getVal = (key) => {
                const val = row[key] || row[key.toUpperCase()] || '';
                return val.toString().trim();
            };

            const idRaw = getVal('ID ASSISTENTE');
            const nomeRaw = getVal('NOME ASSIST');
            const contratoRaw = getVal('CONTRATO').toUpperCase();
            const situacaoRaw = getVal('SITUAÇÃO').toUpperCase();

            if (!idRaw || !nomeRaw) continue; // Pula linhas inválidas

            const id = parseInt(idRaw);
            const ativo = situacaoRaw === 'ATIVO';
            
            let funcao = 'ASSISTENTE';
            if (contratoRaw.includes('AUDITORA')) funcao = 'AUDITORA';
            if (contratoRaw.includes('GESTORA')) funcao = 'GESTORA';

            // Adiciona ao Map (Se o ID já existir, ele atualiza com os dados desta linha)
            mapUsuarios.set(id, {
                id: id,
                nome: nomeRaw,
                contrato: contratoRaw,
                funcao: funcao,
                ativo: ativo,
                senha: senhaPadraoHash
            });
        }

        // Converte o Map de volta para lista (agora sem duplicatas)
        const listaUpsert = Array.from(mapUsuarios.values());

        console.log(`📉 Reduzido para ${listaUpsert.length} usuários únicos.`);

        if (listaUpsert.length > 0) {
            const { error } = await Sistema.supabase
                .from('usuarios')
                .upsert(listaUpsert, { onConflict: 'id' }); 

            if (error) {
                console.error("Erro Supabase:", error);
                alert("Erro ao salvar no banco: " + error.message);
            } else {
                alert(`✅ Sucesso! ${listaUpsert.length} usuários importados (sem duplicatas).`);
                if (Gestao.Usuarios) Gestao.Usuarios.carregar(); 
            }
        } else {
            alert("Nenhum dado válido encontrado.");
        }
    }
};