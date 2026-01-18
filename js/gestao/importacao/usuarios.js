window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Usuarios = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        const parentDiv = input.closest('div'); 
        const btnImportar = parentDiv ? parentDiv.querySelector('button') : null;
        let originalText = '';
        
        if (btnImportar) {
            originalText = btnImportar.innerHTML;
            btnImportar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criptografando...';
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
        console.log(`📊 Linhas brutas: ${linhas.length}`);
        
        const mapUsuarios = new Map();
        
        // --- CRIPTOGRAFIA NA IMPORTAÇÃO 🔒 ---
        // Geramos o hash da senha padrão UMA vez para usar em todos
        const senhaPadraoHash = await Sistema.gerarHash("gupy123"); 

        for (const row of linhas) {
            const getVal = (key) => {
                const val = row[key] || row[key.toUpperCase()] || '';
                return val.toString().trim();
            };

            const idRaw = getVal('ID ASSISTENTE');
            const nomeRaw = getVal('NOME ASSIST');
            const contratoRaw = getVal('CONTRATO').toUpperCase();
            const situacaoRaw = getVal('SITUAÇÃO').toUpperCase();

            if (!idRaw || !nomeRaw) continue;

            const id = parseInt(idRaw);
            const ativo = situacaoRaw === 'ATIVO';
            
            let funcao = 'ASSISTENTE';
            if (contratoRaw.includes('AUDITORA')) funcao = 'AUDITORA';
            if (contratoRaw.includes('GESTORA')) funcao = 'GESTORA';

            mapUsuarios.set(id, {
                id: id,
                nome: nomeRaw,
                contrato: contratoRaw,
                funcao: funcao,
                ativo: ativo,
                senha: senhaPadraoHash // Enviamos o Hash, não o texto
            });
        }

        const listaUpsert = Array.from(mapUsuarios.values());

        console.log(`📉 Usuários únicos: ${listaUpsert.length}`);

        if (listaUpsert.length > 0) {
            const { error } = await Sistema.supabase
                .from('usuarios')
                .upsert(listaUpsert, { onConflict: 'id' }); 

            if (error) {
                console.error("Erro Supabase:", error);
                alert("Erro ao salvar: " + error.message);
            } else {
                alert(`✅ Sucesso! ${listaUpsert.length} usuários importados com criptografia.`);
                if (Gestao.Usuarios) Gestao.Usuarios.carregar(); 
            }
        } else {
            alert("Nenhum dado válido encontrado.");
        }
    }
};